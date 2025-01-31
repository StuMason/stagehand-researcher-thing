// utils/logger.js
export const debugLog = (context, message, data = null) => {
    if (process.env.NODE_ENV !== 'production') {
      const timestamp = new Date().toISOString();
      const logMessage = {
        timestamp,
        context,
        message,
        ...(data && { data })
      };
      console.log(JSON.stringify(logMessage, null, 2));
    }
  };