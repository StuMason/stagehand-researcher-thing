// server.js
// Load environment variables first, before any other imports
import { StagehandConfig, serverConfig } from './src/config/index.js';

import express from 'express';
import { Stagehand } from "@browserbasehq/stagehand";
import Queue from 'bull';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import pkg from '@bull-monitor/express';
import rootPkg from '@bull-monitor/root/dist/bull-adapter.js';
import { conductResearch } from './src/services/researchService.js';
import { debugLog } from './src/utils/logger.js';
import { ProfileSchema } from './src/utils/index.js';


const { BullMonitorExpress } = pkg;
const { BullAdapter } = rootPkg;

// Initialize Express
const app = express();
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

app.use('/research', limiter);

// Initialize Bull Queue
const researchQueue = new Queue('research-queue', serverConfig.redisUrl, {
  defaultJobOptions: {
    timeout: 1800000, // 30 minute timeout
    attempts: 1,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100,
    removeOnFail: 100
  }
});

// Setup Bull Monitor
async function setupMonitor() {
  const monitor = new BullMonitorExpress({
    queues: [new BullAdapter(researchQueue)]
  });
  await monitor.init();
  app.use('/monitor', monitor.router);
}

setupMonitor().catch(console.error);

// Express routes
app.post('/research', async (req, res) => {
  try {
    const profile = ProfileSchema.parse(req.body);
    const job = await researchQueue.add(profile);
    
    res.status(202).json({
      jobId: job.id,
      status: 'processing',
      statusUrl: `/research/${job.id}`
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    res.status(400).json({ error: error.message });
  }
});

app.get('/research/:jobId', async (req, res) => {
  try {
    const job = await researchQueue.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const state = await job.getState();
    
    res.json({
      jobId: job.id,
      status: state,
      progress: job.progress(),
      result: job.returnvalue,
      error: job.failedReason,
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

// Queue processor
researchQueue.process(async (job) => {
  const stagehand = new Stagehand(StagehandConfig);

  try {
    await stagehand.init();
    return await conductResearch(stagehand, job.data);
  } finally {
    await stagehand.close();
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Internal server error',
    message: serverConfig.env === 'development' ? err.message : undefined
  });
});

// Queue event handling
researchQueue.on('completed', (job, result) => {
  debugLog('queue:completed', `Job ${job.id} completed successfully`);
});

researchQueue.on('failed', (job, error) => {
  debugLog('queue:failed', `Job ${job.id} failed`, { error: error.message });
});

researchQueue.on('stalled', (job) => {
  debugLog('queue:stalled', `Job ${job.id} stalled`);
});

// Start server
app.listen(serverConfig.port, serverConfig.host, () => {
  console.log(`Research server running on ${serverConfig.host}:${serverConfig.port}`);
});