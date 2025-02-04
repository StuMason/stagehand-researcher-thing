import express from "express";
import Queue from "bull";
import rateLimit from "express-rate-limit";
import { StagehandConfig, serverConfig } from "./src/config/index.js";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import { debugLog } from "./src/utils/logger.js";
import conductResearch from "./src/services/researchService.js";

// Initialize Express app
const app = express();
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 10000, // 15 minutes
  max: 3000,
  message: { error: "Too many requests, please try again later" }
});

app.use("/research", limiter);

// Initialize research queue
const researchQueue = new Queue("research-queue", serverConfig.redisUrl, {
  defaultJobOptions: {
    timeout: 1800000, // 30 minute timeout
    attempts: 3,
    backoff: {
      type: "fixed",
      delay: 5000
    },
    removeOnComplete: 100,
    removeOnFail: 100
  }
});

// Profile validation schema
const ProfileSchema = z.object({
  name: z.string().min(1),
  context: z.string().min(1)
});

// Research job processor
researchQueue.process(async (job) => {
  const startTime = performance.now();
  let stagehand = null;
  
  try {
    stagehand = new Stagehand(StagehandConfig);
    await stagehand.init();
    
    job.progress(10);
    debugLog("research:start", "Starting research process", { profile: job.data });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Processing timeout reached")), 600000); // 10-minute limit
    });
    
    const results = await Promise.race([
      conductResearch(stagehand, job.data),
      timeoutPromise
    ]);

    job.progress(100);

    const duration = performance.now() - startTime;
    debugLog("research:complete", "Research completed successfully", {
      duration,
      profile: job.data
    });

    return results;

  } catch (error) {
    debugLog("research:error", "Error in research process", {
      error: error.message,
      stack: error.stack,
      attempt: job.attemptsMade
    });
    throw error;

  } finally {
    if (stagehand) {
      await stagehand.close().catch(console.error);
    }
  }
});

// POST endpoint to start research
app.post("/research", async (req, res) => {
  try {
    const profile = ProfileSchema.parse(req.body);
    
    const job = await researchQueue.add(profile, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    });

    res.status(202).json({
      jobId: job.id,
      status: "processing",
      statusUrl: `/research/${job.id}`,
      estimatedTime: "5-15 minutes"
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Invalid input",
        details: error.errors
      });
    }
    res.status(400).json({ error: error.message });
  }
});

// GET endpoint to check research status
app.get("/research/:jobId", async (req, res) => {
  try {
    const job = await researchQueue.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const state = await job.getState();
    const progress = job.progress();

    res.json({
      jobId: job.id,
      status: state,
      progress: progress,
      result: job.returnvalue,
      error: job.failedReason,
      timestamp: {
        created: job.timestamp,
        started: job.processedOn,
        finished: job.finishedOn
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await researchQueue.close();
  server.close();
});

// Start server
const server = app.listen(serverConfig.port, serverConfig.host, () => {
  console.log(`Research server running on ${serverConfig.host}:${serverConfig.port}`);
});