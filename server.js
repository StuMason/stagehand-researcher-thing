import express from 'express';
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

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

// Basic request validation
const validateRequest = (req, res, next) => {
  if (!req.body.url && !req.body.action && !req.body.extract && !req.body.observe) {
    return res.status(400).json({ error: 'At least one operation (url, action, extract, or observe) must be specified' });
  }
  next();
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Main browser automation endpoint
app.post('/browser', validateRequest, async (req, res) => {
  let stagehand;
  const TIMEOUT = 60000; // Increased to 60 seconds
  
  const timeoutId = setTimeout(() => {
    if (stagehand) stagehand.close().catch(console.error);
    res.status(504).json({ error: 'Request timeout' });
  }, TIMEOUT);
  
  try {
    // Initialize Stagehand
    stagehand = new Stagehand(StagehandConfig);
    await stagehand.init();
    const page = stagehand.page;
    
    // Navigate to the URL
    if (req.body.url) {
      await page.goto(req.body.url);
      // Wait for network to be idle
      await page.waitForLoadState('networkidle');
    }
    
    // Perform actions if specified
    if (req.body.action) {
      const actResult = await page.act({
        action: req.body.action
      });
      console.log('Action result:', actResult);
      // Wait for navigation and network idle after action
      await page.waitForLoadState('networkidle');
    }
    
    // Extract data if specified
    if (req.body.extract) {
      const data = await page.extract({
        instruction: req.body.extract,
        schema: z.object({
          result: z.string()
        })
      });
      clearTimeout(timeoutId);
      res.json(data);
    } else if (req.body.observe) {
      const elements = await page.observe({
        instruction: req.body.observe
      });
      clearTimeout(timeoutId);
      res.json({ elements });
    } else {
      clearTimeout(timeoutId);
      res.json({ status: 'success' });
    }
    
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('Error:', {
      url: req.body.url,
      action: req.body.action,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    // Ensure we only close after we've sent the response
    if (res.headersSent && stagehand) {
      await stagehand.close().catch(console.error);
    }
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down...');
  process.exit(0);
});

const HOST = '127.0.0.1';
const PORT = process.env.PORT || 3000;
app.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});