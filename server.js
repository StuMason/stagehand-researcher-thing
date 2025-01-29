import express from 'express';
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from 'zod';
import dotenv from 'dotenv';
import Queue from 'bull';
import Redis from 'ioredis';
import basicAuth from 'express-basic-auth';
import pkg from '@bull-monitor/express';
import rootPkg from '@bull-monitor/root/dist/bull-adapter.js';

const { BullMonitorExpress } = pkg;
const { BullAdapter } = rootPkg;

dotenv.config();

// Redis client for storing job results
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
});

// Bull queue for job processing
const scrapingQueue = new Queue('scraping-queue', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
  },
  defaultJobOptions: {
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 100,    // Keep last 100 failed jobs
    timeout: 1200000,     // 20 minute timeout
    attempts: 3,          // Retry failed jobs up to 3 times
    backoff: {
      type: 'exponential',
      delay: 1000,        // Initial delay of 1 second
    },
  },
});

const StagehandConfig = {
  env: "LOCAL",
  apiKey: process.env.BROWSERBASE_API_KEY,
  projectId: process.env.BROWSERBASE_PROJECT_ID,
  debugDom: true,
  headless: true,
  logger: (message) => console.log(`${message.timestamp}::[stagehand:${message.category}] ${message.message}`),
  domSettleTimeoutMs: 30000,
  browserbaseSessionCreateParams: {
    projectId: process.env.BROWSERBASE_PROJECT_ID,
  },
  enableCaching: true,
  browserbaseSessionID: undefined,
  modelName: "gpt-4o",
  modelClientOptions: {
    apiKey: process.env.OPENAI_API_KEY,
  },
};


const app = express();
app.use(express.json());

// Setup Bull Monitor
async function setupMonitor() {
  const monitor = new BullMonitorExpress({
    queues: [
      new BullAdapter(scrapingQueue)
    ]
  });

  await monitor.init();
  app.use('/monitor', monitor.router);
}

// Initialize the monitor
setupMonitor().catch(console.error);

// Validate request middleware
const validateRequest = (req, res, next) => {
  if (!req.body.url && !req.body.action && !req.body.extract && !req.body.observe) {
    return res.status(400).json({ error: 'At least one operation must be specified' });
  }
  next();
};

// Create a new job
app.post('/jobs', validateRequest, async (req, res) => {
  try {
    const job = await scrapingQueue.add(req.body, {
      priority: req.body.priority || 0,  // Optional priority
    });

    res.status(202).json({ 
      jobId: job.id,
      status: 'pending',
      statusUrl: `/jobs/${job.id}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get job status
app.get('/jobs/:jobId', async (req, res) => {
  try {
    const job = await scrapingQueue.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const state = await job.getState();
    const result = await redis.get(`job:${job.id}:result`);
    const error = await redis.get(`job:${job.id}:error`);

    res.json({
      jobId: job.id,
      status: state,
      result: result ? JSON.parse(result) : null,
      error: error ? JSON.parse(error) : null,
      progress: job.progress(),
      timestamp: {
        created: job.timestamp,
        started: job.processedOn,
        finished: job.finishedOn,
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List all jobs with pagination
app.get('/jobs', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const status = req.query.status;
    
    let jobs;
    switch (status) {
      case 'completed':
        jobs = await scrapingQueue.getCompleted();
        break;
      case 'failed':
        jobs = await scrapingQueue.getFailed();
        break;
      case 'active':
        jobs = await scrapingQueue.getActive();
        break;
      case 'waiting':
        jobs = await scrapingQueue.getWaiting();
        break;
      default:
        jobs = await scrapingQueue.getJobs();
    }

    const start = (page - 1) * limit;
    const paginatedJobs = jobs.slice(start, start + limit);

    const jobsWithState = await Promise.all(
      paginatedJobs.map(async (job) => ({
        jobId: job.id,
        status: await job.getState(),
        timestamp: {
          created: job.timestamp,
          started: job.processedOn,
          finished: job.finishedOn,
        }
      }))
    );

    res.json({
      jobs: jobsWithState,
      pagination: {
        total: jobs.length,
        page,
        limit,
        pages: Math.ceil(jobs.length / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel a job
app.delete('/jobs/:jobId', async (req, res) => {
  try {
    const job = await scrapingQueue.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    await job.remove();
    await redis.del(`job:${job.id}:result`);
    await redis.del(`job:${job.id}:error`);

    res.json({ message: 'Job cancelled successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Process jobs
scrapingQueue.process(async (job, done) => {
  let stagehand = null;

  try {
    job.progress(0);
    stagehand = new Stagehand(StagehandConfig);
    await stagehand.init();
    const page = stagehand.page;
    
    job.progress(20);
    
    if (job.data.url) {
      await page.goto(job.data.url);
      await page.waitForLoadState('networkidle');
    }
    
    job.progress(40);
    
    if (job.data.action) {
      await page.act({
        action: job.data.action
      });
      await page.waitForLoadState('networkidle');
    }
    
    job.progress(60);
    
    let result = null;
    
    if (job.data.extract) {
      result = await page.extract({
        instruction: job.data.extract,
        schema: z.object({
          result: z.string()
        })
      });
    } else if (job.data.observe) {
      result = await page.observe({
        instruction: job.data.observe
      });
    }

    job.progress(80);

    // Store result in Redis
    await redis.set(
      `job:${job.id}:result`, 
      JSON.stringify(result),
      'EX',
      86400 // Expire after 24 hours
    );

    job.progress(100);
    done(null, result);

  } catch (error) {
    // Store error in Redis
    await redis.set(
      `job:${job.id}:error`,
      JSON.stringify({ message: error.message, stack: error.stack }),
      'EX',
      86400 // Expire after 24 hours
    );
    done(error);
  } finally {
    if (stagehand) {
      await stagehand.close();
    }
  }
});

// Handle queue events
scrapingQueue.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed`);
});

scrapingQueue.on('failed', (job, error) => {
  console.error(`Job ${job.id} failed:`, error);
});

scrapingQueue.on('stalled', (job) => {
  console.warn(`Job ${job.id} stalled`);
});

const HOST = '127.0.0.1';
const PORT = process.env.PORT || 3333;
app.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});