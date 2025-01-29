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
  let stagehand = null;
  let hasResponded = false;
  
  const sendResponse = (status, data) => {
    if (!hasResponded) {
      hasResponded = true;
      res.status(status).json(data);
    }
  };
  
  try {
    // Initialize Stagehand
    stagehand = new Stagehand(StagehandConfig);
    await stagehand.init();
    const page = stagehand.page;
    
    console.log('Navigating to URL:', req.body.url);
    if (req.body.url) {
      await page.goto(req.body.url);
      await page.waitForLoadState('networkidle');
      console.log('Page loaded');
    }
    
    if (req.body.action) {
      console.log('Performing action:', req.body.action);
      await page.act({
        action: req.body.action
      });
      await page.waitForLoadState('networkidle');
      console.log('Action completed');
    }
    
    let result = null;
    
    if (req.body.extract) {
      console.log('Extracting data');
      result = await page.extract({
        instruction: req.body.extract,
        schema: z.object({
          result: z.string()
        })
      });
      console.log('Extraction completed');
    } else if (req.body.observe) {
      console.log('Observing elements');
      result = await page.observe({
        instruction: req.body.observe
      });
      console.log('Observation completed');
    }
    
    // Close browser before sending response
    if (stagehand) {
      console.log('Closing browser');
      await stagehand.close();
      stagehand = null;
    }
    
    sendResponse(200, result || { status: 'success' });
    
  } catch (error) {
    console.error('Error:', {
      url: req.body.url,
      action: req.body.action,
      error: error.message,
      stack: error.stack
    });
    
    // Close browser in case of error
    if (stagehand) {
      try {
        await stagehand.close();
      } catch (closeError) {
        console.error('Error closing browser:', closeError);
      }
      stagehand = null;
    }
    
    sendResponse(500, { 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

const HOST = '127.0.0.1';
const PORT = process.env.PORT || 3333;
app.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});