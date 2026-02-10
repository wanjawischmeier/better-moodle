# Better-Moodle Chrome Extension

This directory contains the Chrome extension version of Better-Moodle for UzL.

## 📁 Directory Structure

```
extension/
├── manifest.json              # Extension manifest (permissions, metadata)
├── background.js              # Service worker (handles CORS, script registration)
├── main.js                    # Main entry point (loads scripts in correct order)
├── content-script-bridge.js   # Bridge between page and extension APIs
├── darkreader-loader-inline.js # DarkReader loader (prevents AMD conflicts)
├── README.md                  # This file
├── .gitignore                 # Git ignore rules
├── icon-48.png               # Extension icon (48x48) - NEEDS TO BE ADDED
├── icon-128.png              # Extension icon (128x128) - NEEDS TO BE ADDED
├── polyfills/                # GM_* API polyfills for Chrome
│   └── chrome.js             # GM_* APIs implementation (message passing)
└── scripts/                  # Userscript files (copy from dist/)
    ├── better-moodle-uzl.user.js # COPY FROM DIST
    └── darkreader.js             # NEEDS TO BE DOWNLOADED
```

## 🚀 Installation

### 1. Prepare Required Files

#### Copy Userscript Files
Copy the following files from the `dist/` folder to `extension/scripts/`:
```bash
# From the project root:
copy dist\better-moodle-uzl-polyfills.js extension\scripts\
copy dist\better-moodle-uzl.user.js extension\scripts\
```

#### Add Icons
You need to provide two icon files:
- `extension/icon-48.png` (48x48 pixels)
- `extension/icon-128.png` (128x128 pixels)

You can download the UzL icon from: https://icons.better-moodle.dev/uzl.png
Then resize it to the required sizes.

### 2. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the `extension` folder
5. The extension should now be loaded and active!

### 3. Verify Installation

1. Navigate to https://moodle.uni-luebeck.de/
2. Open the browser console (F12)
3. Look for: `[Better-Moodle Extension] GM_* APIs initialized`
4. The Better-Moodle features should now be active

## 🔄 Updating

When a new version of Better-Moodle is released:

1. Build the new userscript version
2. Copy the new file from `dist/` to `extension/scripts/`:
   - `better-moodle-uzl.user.js`
3. Update the `version` in `manifest.json` to match
4. Go to `chrome://extensions/`
5. Click the refresh icon on the Better-Moodle extension card

## 🏗️ Architecture

### Three-Context System

The extension uses a sophisticated three-context architecture:

1. **MAIN World (Page Context)**: Scripts run directly in the page with access to Moodle's globals (RequireJS, M, etc.)
   - `main.js`: Orchestrates loading order
   - `polyfills/chrome.js`: Provides GM_* APIs via message passing
   - `darkreader-loader-inline.js`: Loads DarkReader preventing AMD conflicts
   - `scripts/better-moodle-uzl.user.js`: Your userscript

2. **ISOLATED World (Content Script Context)**: Bridge between page and extension
   - `content-script-bridge.js`: Handles chrome.storage and forwards XHR requests

3. **Background Context (Service Worker)**: Has full extension permissions
   - `background.js`: Registers MAIN world scripts and handles CORS-free XHR

### Script Loading

Scripts are registered via `chrome.scripting.registerContentScripts` with `world: 'MAIN'` for Tampermonkey-level performance:

```javascript
// In background.js on install:
chrome.scripting.registerContentScripts([{
  id: 'better-moodle-main',
  matches: ['https://moodle.uni-luebeck.de/*'],
  js: ['main.js'],
  runAt: 'document_start',
  world: 'MAIN'  // Runs in page context!
}]);
```

The `main.js` script then loads dependencies synchronously in the correct order:
1. Polyfills (GM_* APIs)
2. Wait for storage cache to initialize
3. DarkReader (with AMD prevention)
4. Userscript (with all dependencies ready)

### API Compatibility

The following Greasemonkey APIs are polyfilled for Chrome:

| GM API | Chrome Implementation | Notes |
|--------|----------------------|-------|
| `GM_getValue` | `chrome.storage.local` | Synchronous with in-memory cache |
| `GM_setValue` | `chrome.storage.local` | Synchronous wrapper with async backend |
| `GM_deleteValue` | `chrome.storage.local` | Synchronous wrapper |
| `GM_listValues` | `chrome.storage.local` | Lists all keys with prefix |
| `GM_addValueChangeListener` | `chrome.storage.onChanged` | Monitors storage changes |
| `GM_notification` | `chrome.notifications` | Full notification support |
| `GM.xmlHttpRequest` | Background fetch + message passing | CORS bypass via host_permissions |
| `GM_addStyle` | Direct DOM injection | Adds `<style>` elements |
| `GM_info` | Constructed from `manifest.json` | Script metadata |
| `unsafeWindow` | `window` | Direct window object |

### Storage

All storage keys are prefixed with `bm_` to avoid conflicts. The storage system uses:
- In-memory cache for synchronous access (matching userscript behavior)
- Message passing between MAIN world and content script
- `chrome.storage.local` for persistence (via content script bridge)
- Automatic cache synchronization across tabs via storage change listeners

### Permissions

The extension requires:
- **`storage`**: For GM_getValue/GM_setValue functionality
- **`notifications`**: For GM_notification functionality
- **`scripting`**: For injecting scripts into MAIN world (page context)
- **`host_permissions`**: For cross-origin requests to external APIs (CORS bypass)

## 🔧 Development

### Adding Support for Other Browsers

To adapt this extension for Firefox or other browsers:

1. Update manifest to Manifest V2 if needed (Firefox supports both V2 and V3)
2. Verify `chrome.scripting.registerContentScripts` compatibility (may need polyfill)
3. Adjust host_permissions format if browser-specific syntax differs
4. Test message passing between worlds (should work cross-browser)

The core architecture (MAIN world injection + message passing) is browser-agnostic.ersion
3. Import and use in `polyfills/index.js`
4. Create a browser-specific loader (e.g., `polyfills/firefox.js`)
5. Update manifest for the target browser

### Modifying Polyfills

Each API is isolated in its own module:
- **Storage**: `polyfills/browsers/chrome-storage.js`
- **Notifications**: `polyfills/browsers/chrome-notifications.js`
- **XHR**: `polyfills/browsers/chrome-xhr.js`
- **Info**: `polyfills/browsers/chrome-info.js`

## 📝 Notes

- The userscript files are **not** automatically copied during build
- You must manually copy them from `dist/` to `extension/scripts/`
- This keeps the extension modular and the build process simple
- DarkReader must be downloaded separately to respect their license/distribution

## 🐛 Troubleshooting

### Extension not loading
- Check that all required files are present in `extension/scripts/`
- Verify icon files are present
- Check browser console for errors

### Features not working
- Open console and look for error messages
- Verify that `GM_* APIs initialized` message appears
- Check that permissions are granted in `chrome://extensions/`

### Storage issues
- Open DevTools → Application → Storage → Extensions
- Look for keys prefixed with `bm_`
- Clear storage if needed: `chrome.storage.local.clear()`

## 📄 License

Same as Better-Moodle main project (MIT License)
