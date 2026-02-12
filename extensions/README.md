# Better-Moodle Chrome Extension

This directory contains the Chrome extension wrapper for the userscript.

### API Compatibility

The following Greasemonkey APIs are polyfilled as follows:

| GM API                      | Chrome Implementation              | Firefox Implementation               | Notes                                  |
| --------------------------- | ---------------------------------- | ------------------------------------ | -------------------------------------- |
| `GM_getValue`               | `chrome.storage.local`             | `browser.storage.local`              | Synchronous with in-memory cache       |
| `GM_setValue`               | `chrome.storage.local`             | `browser.storage.local`              | Synchronous wrapper with async backend |
| `GM_deleteValue`            | `chrome.storage.local`             | `browser.storage.local`              | Synchronous wrapper                    |
| `GM_listValues`             | `chrome.storage.local`             | `browser.storage.local`              | Lists all keys with prefix             |
| `GM_addValueChangeListener` | `chrome.storage.onChanged`         | `browser.storage.onChanged`          | Monitors storage changes               |
| `GM_notification`           | `chrome.notifications`             | `browser.notifications`              | Full notification support              |
| `GM.xmlHttpRequest`         | Background fetch + message passing | Background fetch + message passing   | CORS bypass via host_permissions       |
| `GM_addStyle`               | Direct DOM injection               | Direct DOM injection                 | Adds `<style>` elements                |
| `GM_info`                   | Constructed from `manifest.json`   | Constructed from `manifest.json`     | Script metadata                        |
| `unsafeWindow`              | `window`                           | `window`                             | Direct window object                   |

### Storage

All storage keys are prefixed with `bm_` to avoid conflicts. The storage system uses:

- In-memory cache for synchronous access (matching userscript behavior)
- Message passing between MAIN world and content script
- `chrome.storage.local` for persistence (via content script bridge)
- Automatic cache synchronization across tabs via storage change listeners
