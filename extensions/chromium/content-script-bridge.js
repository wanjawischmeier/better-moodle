/**
 * Content Script Bridge for Better-Moodle Chrome Extension
 *
 * This script runs in the CONTENT SCRIPT CONTEXT and has access to chrome APIs.
 * It handles messages from the injected page script and performs chrome.storage
 * and chrome.notifications operations.
 */

(function () {
    'use strict';

    const STORAGE_PREFIX = 'bm_';
    const activeXHRRequests = new Map();

    console.log('[Better-Moodle Extension] Content script bridge initialized');

    /**
     * Send a response back to the page context
     */
    function sendResponse(id, success, result, error) {
        window.postMessage(
            { source: 'better-moodle-content', id, success, result, error },
            '*'
        );
    }

    /**
     * Send an event back to the page context (for XHR events)
     */
    function sendEvent(type, requestId, data) {
        window.postMessage(
            { source: 'better-moodle-content', type, requestId, data },
            '*'
        );
    }

    /**
     * Handle XHR request by forwarding to background script
     */
    async function handleXHRRequest(details) {
        try {
            // Forward request to background script which has full CORS bypass
            await chrome.runtime.sendMessage({
                type: 'XHR_REQUEST',
                details: details,
            });
        } catch (error) {
            console.error(
                '[Better-Moodle Extension] Failed to send XHR request to background:',
                error
            );
            sendEvent('XHR_ERROR', details.requestId, {
                status: 0,
                statusText: error.message,
                error: error.message,
                context: details.context,
            });
        }
    }

    /**
     * Listen for XHR responses from background script
     */
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type && message.type.startsWith('XHR_')) {
            // Forward XHR events to page context
            sendEvent(message.type, message.requestId, message.data);
        }
    });

    /**
     * Handle messages from page context
     */
    window.addEventListener('message', async event => {
        // Only accept messages from same window
        if (event.source !== window) return;

        // Only accept messages from our page script
        if (!event.data || event.data.source !== 'better-moodle-page') return;

        const { type, data, id } = event.data;

        try {
            switch (type) {
                case 'STORAGE_GET_ALL': {
                    const result = await chrome.storage.local.get(null);
                    const filtered = {};
                    Object.keys(result).forEach(key => {
                        if (key.startsWith(STORAGE_PREFIX)) {
                            filtered[key.substring(STORAGE_PREFIX.length)] =
                                result[key];
                        }
                    });
                    sendResponse(id, true, filtered);
                    break;
                }

                case 'STORAGE_SET': {
                    const { key, value } = data;
                    await chrome.storage.local.set({
                        [STORAGE_PREFIX + key]: value,
                    });
                    sendResponse(id, true, null);
                    break;
                }

                case 'STORAGE_DELETE': {
                    const { key } = data;
                    await chrome.storage.local.remove(STORAGE_PREFIX + key);
                    sendResponse(id, true, null);
                    break;
                }

                case 'NOTIFICATION': {
                    const {
                        text = '',
                        title = 'Better-Moodle',
                        image,
                        onclick,
                        ondone,
                    } = data;

                    const chromeNotificationOptions = {
                        type: 'basic',
                        iconUrl: image || chrome.runtime.getURL('icon-128.png'),
                        title: title,
                        message: text,
                        priority: 2,
                    };

                    await chrome.notifications.create(
                        '',
                        chromeNotificationOptions
                    );
                    sendResponse(id, true, null);
                    break;
                }

                case 'XHR_REQUEST': {
                    handleXHRRequest(data);
                    sendResponse(id, true, null);
                    break;
                }

                case 'XHR_ABORT': {
                    const { requestId } = data;
                    if (activeXHRRequests.has(requestId)) {
                        activeXHRRequests.get(requestId).abort();
                        activeXHRRequests.delete(requestId);
                    }
                    sendResponse(id, true, null);
                    break;
                }

                default:
                    sendResponse(
                        id,
                        false,
                        null,
                        `Unknown message type: ${type}`
                    );
            }
        } catch (error) {
            console.error('[Better-Moodle Extension] Bridge error:', error);
            sendResponse(id, false, null, error.message);
        }
    });

    /**
     * Listen for storage changes and notify page context
     */
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') {
            Object.keys(changes).forEach(prefixedKey => {
                if (prefixedKey.startsWith(STORAGE_PREFIX)) {
                    const key = prefixedKey.substring(STORAGE_PREFIX.length);
                    const change = changes[prefixedKey];

                    window.postMessage(
                        {
                            source: 'better-moodle-content',
                            type: 'STORAGE_CHANGED',
                            data: {
                                key,
                                oldValue: change.oldValue,
                                newValue: change.newValue,
                            },
                        },
                        '*'
                    );
                }
            });
        }
    });
})();
