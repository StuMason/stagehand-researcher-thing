import winston from 'winston';

// Configure the logger with file transports
const logger = winston.createLogger({
  level: 'debug', // capture all logs from debug level and up
  format: winston.format.json(),
  transports: [
    // Logs with level 'error' and below go to error.log
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    // All logs (debug and above) go to combined.log
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Optionally, in non-production environments, you can also log to the console:
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

export const debugLog = (category, message, auxiliary = null) => {
  const logLine = {
    timestamp: new Date().toISOString(),
    category,
    message,
    auxiliary: auxiliary && Object.fromEntries(
      Object.entries(auxiliary).map(([k, v]) => [k, { value: v, type: typeof v }])
    )
  };
  // Log the message at debug level; Winston will direct it to the proper file(s)
  logger.debug(logLine);
};
