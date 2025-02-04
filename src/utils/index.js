import { z } from 'zod';
import { debugLog } from './logger.js';

export const parseAction = (actionText) => {
  debugLog("action:parse", "Parsing action text", { actionText });
  try {
    if (actionText.includes("SEARCH")) {
      const query = actionText.match(/SEARCH: (.*)/)[1];
      return { type: "search", query };
    }
    if (actionText.includes("NAVIGATE")) {
      const url = actionText.match(/NAVIGATE: (.*)/)[1];
      return { type: "navigate", url };
    }
    if (actionText.includes("EXTRACT")) {
      const instruction = actionText.match(/EXTRACT: (.*)/)[1];
      return { type: "extract", instruction };
    }
    if (actionText.includes("OBSERVE")) {
      const instruction = actionText.match(/OBSERVE: (.*)/)[1];
      return { type: "observe", instruction };
    }
    if (actionText.includes("CONCLUDE")) {
      return { type: "conclude" };
    }
    return null;
  } catch (error) {
    debugLog("action:parse-error", "Failed to parse action", {
      error: error.message,
    });
    return null;
  }
};



export const ProfileSchema = z.object({
  name: z.string().min(1),
  context: z.string().optional(),
  interests: z.array(z.string()).optional(),
});
