export function sanitizeJsonOutput(text) {
    let sanitized = text.trim();
    // Remove leading code fence if it exists
    if (sanitized.startsWith("```json")) {
      sanitized = sanitized.split("\n").slice(1).join("\n");
      // Remove trailing code fence if it exists
      const lastFence = sanitized.lastIndexOf("```");
      if (lastFence !== -1) {
        sanitized = sanitized.substring(0, lastFence).trim();
      }
    }
    return sanitized;
  }
  