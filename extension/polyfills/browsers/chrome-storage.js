/**
 * Chrome Storage API implementation for GM_getValue, GM_setValue, etc.
 */

const STORAGE_PREFIX = 'bm_';

export const chromeStorage = {
  /**
   * Get a value from storage
   * @param {string} key - Storage key
   * @param {*} defaultValue - Default value if key doesn't exist
   * @returns {Promise<*>} The stored value or default
   */
  getValue: async (key, defaultValue) => {
    try {
      const result = await chrome.storage.local.get(STORAGE_PREFIX + key);
      const storedValue = result[STORAGE_PREFIX + key];
      return storedValue !== undefined ? storedValue : defaultValue;
    } catch (error) {
      console.error('GM_getValue error:', error);
      return defaultValue;
    }
  },

  /**
   * Set a value in storage
   * @param {string} key - Storage key
   * @param {*} value - Value to store
   * @returns {Promise<void>}
   */
  setValue: async (key, value) => {
    try {
      await chrome.storage.local.set({ [STORAGE_PREFIX + key]: value });
    } catch (error) {
      console.error('GM_setValue error:', error);
    }
  },

  /**
   * Delete a value from storage
   * @param {string} key - Storage key
   * @returns {Promise<void>}
   */
  deleteValue: async (key) => {
    try {
      await chrome.storage.local.remove(STORAGE_PREFIX + key);
    } catch (error) {
      console.error('GM_deleteValue error:', error);
    }
  },

  /**
   * List all keys in storage
   * @returns {Promise<string[]>} Array of keys (without prefix)
   */
  listValues: async () => {
    try {
      const result = await chrome.storage.local.get(null);
      return Object.keys(result)
        .filter(key => key.startsWith(STORAGE_PREFIX))
        .map(key => key.substring(STORAGE_PREFIX.length));
    } catch (error) {
      console.error('GM_listValues error:', error);
      return [];
    }
  },

  /**
   * Add a listener for value changes
   * @param {string} key - Storage key to monitor
   * @param {Function} callback - Callback function
   * @returns {string} Listener ID (for potential future removal)
   */
  addValueChangeListener: (key, callback) => {
    const prefixedKey = STORAGE_PREFIX + key;
    
    const listener = (changes, areaName) => {
      if (areaName === 'local' && changes[prefixedKey]) {
        const change = changes[prefixedKey];
        // GM_addValueChangeListener signature: (name, oldValue, newValue, remote)
        // remote is true if change came from another instance
        callback(
          key,
          change.oldValue,
          change.newValue,
          true // assume remote for storage.onChanged
        );
      }
    };

    chrome.storage.onChanged.addListener(listener);
    
    // Return listener ID (could be used for removal in the future)
    return `listener_${key}_${Date.now()}`;
  }
};
