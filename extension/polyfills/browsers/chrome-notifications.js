/**
 * Chrome Notifications API implementation for GM_notification
 */

export const chromeNotifications = {
  /**
   * Show a notification
   * @param {Object|string} options - Notification options or text
   * @returns {Promise<void>}
   */
  notification: async (options) => {
    try {
      // Handle both string and object inputs
      const notificationOptions = typeof options === 'string' ? 
        { text: options } : options;

      const {
        text = '',
        title = 'Better-Moodle',
        image,
        onclick,
        ondone
      } = notificationOptions;

      const chromeNotificationOptions = {
        type: 'basic',
        iconUrl: image || chrome.runtime.getURL('icon-128.png'),
        title: title,
        message: text,
        priority: 2
      };

      const notificationId = await chrome.notifications.create(
        '',
        chromeNotificationOptions
      );

      // Handle click callback
      if (onclick) {
        const clickListener = (clickedId) => {
          if (clickedId === notificationId) {
            onclick();
            chrome.notifications.onClicked.removeListener(clickListener);
          }
        };
        chrome.notifications.onClicked.addListener(clickListener);
      }

      // Handle done callback
      if (ondone) {
        const closeListener = (closedId) => {
          if (closedId === notificationId) {
            ondone();
            chrome.notifications.onClosed.removeListener(closeListener);
          }
        };
        chrome.notifications.onClosed.addListener(closeListener);
      }
    } catch (error) {
      console.error('GM_notification error:', error);
    }
  }
};
