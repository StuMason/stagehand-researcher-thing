// server.js
import { StagehandConfig, serverConfig } from "./src/config/index.js";
import express from "express";
import { Stagehand } from "@browserbasehq/stagehand";
import Queue from "bull";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import pkg from "@bull-monitor/express";
import rootPkg from "@bull-monitor/root/dist/bull-adapter.js";
import { debugLog } from "./src/utils/logger.js";
import { ProfileSchema } from "./src/utils/index.js";
import LRUCache from "lru-cache";
import { performance } from "perf_hooks";

const { BullMonitorExpress } = pkg;
const { BullAdapter } = rootPkg;

// Results cache configuration
const resultsCache = new LRUCache({
  max: 500, // Maximum number of items
  ttl: 1000 * 60 * 60, // 1 hour TTL
  updateAgeOnGet: true
});

// Initialize Express
const app = express();
app.use(express.json());

// Enhanced rate limiting with IP-based tracking
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: (req) => req.headers['x-forwarded-for'] || req.ip,
  handler: (req, res) => {
    res.status(429).json({
      error: "Too many requests",
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

app.use("/research", limiter);

// Initialize Bull Queue with retry strategy
const researchQueue = new Queue("research-queue", serverConfig.redisUrl, {
  defaultJobOptions: {
    timeout: 1800000, // 30 minute timeout
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

// Setup Bull Monitor
async function setupMonitor() {
  const monitor = new BullMonitorExpress({
    queues: [new BullAdapter(researchQueue)],
    metrics: {
      collectInterval: 5000,
      maxMetrics: 100
    }
  });
  await monitor.init();
  app.use("/monitor", monitor.router);
}

setupMonitor().catch(console.error);

// Research job processor with enhanced error handling
researchQueue.process(async (job) => {
  const startTime = performance.now();
  let stagehand = null;
  
  try {
    stagehand = new Stagehand(StagehandConfig);
    await stagehand.init();
    
    job.progress(10);
    debugLog("research:start", "Starting research process", { profile: job.data });

    // Profile validation with observation
    const isValidProfile = await verifyProfile(stagehand, job.data);
    if (!isValidProfile) {
      throw new Error("Unable to verify profile authenticity");
    }
    job.progress(30);

    // Conduct research with text extraction
    const results = await conductResearch(stagehand, job.data);
    job.progress(90);

    // Cache successful results
    const cacheKey = JSON.stringify(job.data);
    resultsCache.set(cacheKey, results);

    const duration = performance.now() - startTime;
    debugLog("research:complete", "Research completed successfully", {
      duration,
      profile: job.data
    });

    job.progress(100);
    return results;

  } catch (error) {
    debugLog("research:error", "Error in research process", {
      error: error.message,
      stack: error.stack,
      attempt: job.attemptsMade
    });

    // Handle specific error types
    if (error.message.includes("Navigation timeout")) {
      throw new Error("Navigation timeout - will retry automatically");
    }
    
    throw error;

  } finally {
    if (stagehand) {
      await stagehand.close().catch(console.error);
    }
  }
});

// Profile verification helper
async function verifyProfile(stagehand, profile) {
  try {
    // First navigate to a search page
    await stagehand.page.goto('https://www.google.com');
    
    // Search for the profile
    await stagehand.page.act({
      action: `search for "${profile.name} ${profile.context}"`,
      variables: { name: profile.name, context: profile.context }
    });

    // Wait for results
    await stagehand.page.waitForLoadState('networkidle');

    const observations = await stagehand.page.observe({
      instruction: `Find elements that mention ${profile.name} and their role/context "${profile.context}"`,
      returnAction: true,
      onlyVisible: true // Only look at visible elements
    });

    if (!observations || observations.length === 0) {
      debugLog("verify:warning", "No observations found", { profile });
      return true; // Continue with research if no observations
    }

    const nameMatch = observations.some(obs => 
      obs.description.toLowerCase().includes(profile.name.toLowerCase())
    );

    const contextMatch = observations.some(obs => 
      obs.description.toLowerCase().includes(profile.context.toLowerCase())
    );

    debugLog("verify:result", "Profile verification complete", {
      nameMatch,
      contextMatch,
      observationsCount: observations.length
    });

    return nameMatch || contextMatch; // Return true if either matches

  } catch (error) {
    debugLog("verify:error", "Error verifying profile", { 
      error: error.message,
      stack: error.stack
    });
    return true; // Continue with research on error
  }
}

// Enhanced research function with text extraction
const researchSchema = z.object({
  contactInfo: z.object({
    email: z.string().optional(),
    phone: z.string().optional(),
    social: z.array(z.string()).optional()
  }),
  professionalInfo: z.object({
    currentRole: z.string(),
    company: z.string().optional(),
    experience: z.array(z.string()).optional(),
    skills: z.array(z.string()).optional()
  }),
  confidence: z.number().describe('Confidence score between 0 and 1')
});

async function conductResearch(stagehand, profile) {
  const extractResult = await stagehand.page.extract({
    instruction: `Extract professional information for ${profile.name} including:
    - Contact info (email, phone, social profiles)
    - Current role and company
    - Professional experience
    - Key skills
    Rate confidence between 0 (low) and 1 (high)`,
    schema: researchSchema,
    useTextExtract: true
  });

  return {
    ...extractResult,
    searchTimestamp: new Date().toISOString()
  };
}
// Express routes with caching
app.post("/research", async (req, res) => {
  try {
    const profile = ProfileSchema.parse(req.body);
    const cacheKey = JSON.stringify(profile);

    // Check cache first
    const cached = resultsCache.get(cacheKey);
    if (cached) {
      return res.status(200).json({
        ...cached,
        cached: true
      });
    }

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
      estimatedTime: "30-60 seconds"
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

app.get('/visualize/:jobId', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Research Results</title>
        <script src="https://unpkg.com/react@17/umd/react.development.js"></script>
        <script src="https://unpkg.com/react-dom@17/umd/react-dom.development.js"></script>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body>
        <div id="root"></div>
        <script>
          ReactDOM.render(
            React.createElement(ResearchVisualizer, { jobId: '${req.params.jobId}' }),
            document.getElementById('root')
          );
        </script>
      </body>
    </html>
  `);
});

// Queue monitoring and cleanup
researchQueue.on("stalled", async (job) => {
  debugLog("queue:stalled", `Job ${job.id} stalled`, {
    jobData: job.data,
    timestamp: new Date().toISOString()
  });
  await job.moveToFailed({ message: "Job stalled" });
});

// Add regular cleanup jobs
const cleanupInterval = setInterval(async () => {
  try {
    await researchQueue.clean(7 * 24 * 3600 * 1000, "completed");
    await researchQueue.clean(7 * 24 * 3600 * 1000, "failed");
    
    // Clean old cache entries
    resultsCache.purgeStale();
  } catch (error) {
    debugLog("cleanup:error", "Error during cleanup", { error });
  }
}, 24 * 3600 * 1000);

// Error handling middleware
app.use((err, req, res, next) => {
  debugLog("server:error", "Unhandled error", { 
    error: err.message,
    stack: err.stack
  });
  
  res.status(500).json({
    error: "Internal server error",
    message: serverConfig.env === "development" ? err.message : undefined
  });
});

// Start server
const server = app.listen(serverConfig.port, serverConfig.host, () => {
  console.log(`Research server running on ${serverConfig.host}:${serverConfig.port}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  clearInterval(cleanupInterval);
  await researchQueue.close();
  server.close();
});