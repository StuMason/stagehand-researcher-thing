// src/utils/dialogHandler.js
import { debugLog } from './logger.js';

export async function handleDialogs(page) {
  try {
    // Use StageHand's act to intelligently handle common interruptions
    await page.act({
      action: "dismiss any popup, modal, or permission dialog that might be interrupting the main content. This includes cookie notices, location permissions, newsletter signups, and other interruptions",
      skipActionCacheForThisStep: true  // Don't cache dialog handling since popups can be dynamic
    }).catch(() => {
      // If no actionable dialogs found, that's okay
      debugLog('dialog:check', 'No actionable dialogs found');
    });

  } catch (error) {
    debugLog('dialog:error', 'Error handling dialogs', { error: error.message });
  }
}

// Handle native browser dialogs (alert, confirm, prompt)
export function setupDialogHandling(page) {
  // Handle native dialogs
  page.on('dialog', async (dialog) => {
    debugLog('dialog:native', `Dismissing native dialog: ${dialog.type()}`);
    await dialog.dismiss();
  });

  // Set up a lightweight interval to check for and handle dialogs
  const intervalId = setInterval(async () => {
    await handleDialogs(page);
  }, 5000); // Check every 5 seconds

  // Return cleanup function
  return () => clearInterval(intervalId);
}