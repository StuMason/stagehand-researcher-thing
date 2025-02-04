// config/index.js
import dotenv from 'dotenv';

dotenv.config();

export const StagehandConfig = {
  env: "LOCAL",
  apiKey: process.env.BROWSERBASE_API_KEY,
  projectId: process.env.BROWSERBASE_PROJECT_ID,
  debugDom: process.env.NODE_ENV !== 'production',
  headless: process.env.NODE_ENV === 'production',
  logger: (message) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(JSON.stringify({
        timestamp: message.timestamp,
        category: message.category,
        message: message.message,
        extra: message.extra
      }, null, 2));
    }
  },
  domSettleTimeoutMs: 30000,
  enableCaching: true,
  modelName: process.env.MODEL_NAME || "gpt-4o-mini",
  modelClientOptions: {
    timeout: 30000,
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 3
  },
  browserbaseSessionCreateParams: {
    projectId: process.env.BROWSERBASE_PROJECT_ID,
  },
  browserbaseSessionID: undefined,
};

export const serverConfig = {
  host: process.env.HOST || '127.0.0.1',
  port: process.env.PORT || 3333,
  redisUrl: process.env.REDIS_URL,
  env: process.env.NODE_ENV || 'development'
};

export const cacheConfig = {
  redis: {
    url: process.env.REDIS_URL,
    ttl: 24 * 60 * 60  // 24 hours
  },
  session: {
    persistDuration: 7 * 24 * 60 * 60 * 1000  // 7 days
  }
};