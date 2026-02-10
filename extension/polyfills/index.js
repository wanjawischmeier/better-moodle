/**
 * Chrome Extension Polyfills for Greasemonkey/Tampermonkey GM_* APIs
 * 
 * This module provides Chrome extension implementations for userscript APIs.
 * The structure is modular to allow for future browser-specific implementations.
 */

// Import browser-specific implementations
import { chromeStorage } from './browsers/chrome-storage.js';
import { chromeNotifications } from './browsers/chrome-notifications.js';
import { chromeXhr } from './browsers/chrome-xhr.js';
import { chromeInfo } from './browsers/chrome-info.js';

// Export unified GM_* API
export const GM_getValue = chromeStorage.getValue;
export const GM_setValue = chromeStorage.setValue;
export const GM_deleteValue = chromeStorage.deleteValue;
export const GM_listValues = chromeStorage.listValues;
export const GM_addValueChangeListener = chromeStorage.addValueChangeListener;

export const GM_notification = chromeNotifications.notification;

export const GM = {
  xmlHttpRequest: chromeXhr.xmlHttpRequest
};

export const GM_info = chromeInfo.getInfo();

export const GM_addStyle = (css) => {
  const style = document.createElement('style');
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
  return style;
};

// unsafeWindow in Chrome extensions is just window
export const unsafeWindow = window;
