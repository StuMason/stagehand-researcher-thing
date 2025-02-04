export const debugLog = (category, message, auxiliary = null) => {
  const logLine = {
    timestamp: new Date().toISOString(),
    category,
    message,
    auxiliary: auxiliary && Object.fromEntries(
      Object.entries(auxiliary).map(([k, v]) => [k, {value: v, type: typeof v}])
    )
  };
  console.log(JSON.stringify(logLine));
};