/**
 * Background Service Worker for Better-Moodle Chrome Extension
 * 
 * This script runs in the background and has full access to cross-origin requests
 * without CORS restrictions. It handles XHR requests from the content script.
 */

console.log('[Better-Moodle Extension] Background service worker started');

/**
 * Handle XHR requests from content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'XHR_REQUEST') {
    handleXHRRequest(message.details, sender.tab.id)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep the message channel open for async response
  }
  
  if (message.type === 'XHR_ABORT') {
    // Handle abort requests
    sendResponse({ success: true });
    return false;
  }
});

/**
 * Handle XHR request using fetch API with full extension permissions
 */
async function handleXHRRequest(details, tabId) {
  const {
    requestId,
    method,
    url,
    headers,
    data,
    responseType,
    timeout
  } = details;

  const controller = new AbortController();
  const signal = controller.signal;
  
  // Set up timeout
  let timeoutId;
  if (timeout > 0) {
    timeoutId = setTimeout(() => {
      controller.abort();
    }, timeout);
  }

  try {
    const fetchOptions = {
      method,
      signal,
      // Don't include credentials for cross-origin requests
      credentials: 'omit',
      // Use cors mode with extension permissions
      mode: 'cors'
    };
    
    // Only add headers if provided and not empty
    if (headers && Object.keys(headers).length > 0) {
      fetchOptions.headers = headers;
    }
    
    if (data) {
      fetchOptions.body = data;
    }

    const response = await fetch(url, fetchOptions);
    
    if (timeoutId) clearTimeout(timeoutId);
    
    // Get response text first (always needed)
    const responseText = await response.text();
    
    // Build response headers string
    const responseHeaders = Array.from(response.headers.entries())
      .map(([key, value]) => `${key}: ${value}`)
      .join('\r\n');
    
    // Send success event to content script
    // Note: We send responseText, not complex objects, as Chrome message passing
    // doesn't support Blob/ArrayBuffer directly
    chrome.tabs.sendMessage(tabId, {
      type: 'XHR_LOAD',
      requestId,
      data: {
        status: response.status,
        statusText: response.statusText,
        responseText: responseText,
        response: responseText, // Always send as text, will be converted in page context
        responseHeaders: responseHeaders,
        finalUrl: response.url,
        responseType: responseType,
        contentType: response.headers.get('content-type') || 'text/plain',
        context: details.context
      }
    }).catch(() => {
      // Tab might be closed, ignore error
    });
    
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      chrome.tabs.sendMessage(tabId, {
        type: 'XHR_TIMEOUT',
        requestId,
        data: {
          status: 0,
          statusText: 'timeout',
          context: details.context
        }
      }).catch(() => {});
      return;
    }
    
    chrome.tabs.sendMessage(tabId, {
      type: 'XHR_ERROR',
      requestId,
      data: {
        status: 0,
        statusText: error.message,
        error: error.message,
        context: details.context
      }
    }).catch(() => {});
  }
}
