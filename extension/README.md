# Better-Moodle Chrome Extension

This directory contains the Chrome extension version of Better-Moodle for UzL.

## 📁 Directory Structure

```
extension/
├── manifest.json              # Extension manifest (permissions, metadata)
├── README.md                  # This file
├── icon-48.png               # Extension icon (48x48) - NEEDS TO BE ADDED
├── icon-128.png              # Extension icon (128x128) - NEEDS TO BE ADDED
├── polyfills/                # GM_* API polyfills for Chrome
│   ├── chrome.js            # Main polyfill loader (loads first!)
│   ├── index.js             # Modular polyfill exports (for future use)
│   └── browsers/            # Browser-specific implementations
│       ├── chrome-storage.js      # Chrome storage API wrapper
│       ├── chrome-notifications.js # Chrome notifications wrapper
│       ├── chrome-xhr.js          # XMLHttpRequest wrapper
│       └── chrome-info.js         # Script info provider
└── scripts/                  # Userscript files (copy from dist/)
    ├── better-moodle-uzl-polyfills.js  # COPY FROM DIST
    ├── better-moodle-uzl.user.js       # COPY FROM DIST
    └── darkreader.js                    # NEEDS TO BE DOWNLOADED
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

#### Download DarkReader
Download DarkReader from:
https://unpkg.com/darkreader@4.9.119/darkreader.js

Save it as `extension/scripts/darkreader.js`

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
2. Copy the new files from `dist/` to `extension/scripts/`:
   - `better-moodle-uzl-polyfills.js`
   - `better-moodle-uzl.user.js`
3. Update the `version` in `manifest.json` to match
4. Go to `chrome://extensions/`
5. Click the refresh icon on the Better-Moodle extension card

## 🏗️ Architecture

### Polyfill System

The extension uses a modular polyfill system to provide Greasemonkey/Tampermonkey APIs:

- **`polyfills/chrome.js`**: Main loader that runs first and sets up all `GM_*` APIs as global variables
- **`polyfills/browsers/`**: Browser-specific implementations that can be extended for other browsers

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
| `GM.xmlHttpRequest` | Native `XMLHttpRequest` | CORS handled by host_permissions |
| `GM_addStyle` | Direct DOM injection | Adds `<style>` elements |
| `GM_info` | Constructed from `manifest.json` | Script metadata |
| `unsafeWindow` | `window` | Direct window object |

### Storage

All storage keys are prefixed with `bm_` to avoid conflicts. The storage system uses:
- In-memory cache for synchronous access (matching userscript behavior)
- `chrome.storage.local` for persistence
- Automatic cache synchronization across tabs

### Permissions

The extension requires:
- **`storage`**: For GM_getValue/GM_setValue functionality
- **`notifications`**: For GM_notification functionality
- **`host_permissions`**: For cross-origin requests to external APIs

## 🔧 Development

### Adding Support for Other Browsers

The polyfill system is designed to be extensible:

1. Create a new file in `polyfills/browsers/` (e.g., `firefox-storage.js`)
2. Implement the same interface as the Chrome version
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
