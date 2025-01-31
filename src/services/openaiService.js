// services/openaiService.js
import OpenAI from 'openai';
import { debugLog } from '../utils/logger.js';

console.log('Initializing OpenAI client with config:', {
  hasApiKey: !!process.env.OPENAI_API_KEY,
  keyLength: process.env.OPENAI_API_KEY?.length
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000, // 30 seconds timeout
  maxRetries: 3,
  fetch: (url, init) => {
    console.log('Making OpenAI request:', {
      url,
      method: init.method,
      headers: init.headers,
      bodyLength: init.body?.length
    });
    return fetch(url, {
      ...init,
      signal: AbortSignal.timeout(30000) // 30 second timeout
    });
  }
});

export async function makeGPTCall(messages, temperature = 0.7, maxRetries = 3) {
  console.log('Starting GPT call with config:', {
    messagesCount: messages.length,
    temperature,
    maxRetries,
    lastMessagePreview: messages[messages.length - 1]?.content.substring(0, 100)
  });

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxRetries} - Making request`);

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        temperature,
        max_tokens: 1500,
        presence_penalty: 0.1,
        frequency_penalty: 0.1
      });

      console.log('Request successful:', {
        responseStatus: 'success',
        choicesLength: response.choices?.length
      });

      return response.choices[0].message.content;

    } catch (error) {
      console.error('OpenAI request failed:', {
        attempt,
        errorName: error.name,
        errorMessage: error.message,
        errorCode: error.code,
        errorType: error.type,
        cause: error.cause,
        stack: error.stack?.split('\n')
      });

      if (error.message.includes('Connection error')) {
        // Try to make a test request to check network
        try {
          console.log('Testing network connection...');
          const testResponse = await fetch('https://api.openai.com/v1/models');
          console.log('Network test result:', {
            status: testResponse.status,
            ok: testResponse.ok
          });
        } catch (netError) {
          console.error('Network test failed:', netError);
        }
      }

      if (attempt === maxRetries) {
        throw error;
      }

      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      console.log(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}