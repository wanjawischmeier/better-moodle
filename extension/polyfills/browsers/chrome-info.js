/**
 * Chrome implementation for GM_info
 */

export const chromeInfo = {
  /**
   * Get script information
   * @returns {Object} Script info object
   */
  getInfo: () => {
    const manifest = chrome.runtime.getManifest();
    
    return {
      script: {
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        author: manifest.author,
        homepage: manifest.homepage_url,
        downloadURL: manifest.homepage_url + '/releases/latest/download/better-moodle-uzl.user.js',
        updateURL: manifest.homepage_url + '/releases/latest/download/better-moodle-uzl.meta.js',
        namespace: 'https://uni-luebeck.de',
        includes: ['https://moodle.uni-luebeck.de/*'],
        matches: ['https://moodle.uni-luebeck.de/*'],
        runAt: 'document-start'
      },
      scriptMetaStr: `// @name ${manifest.name}
// @version ${manifest.version}
// @description ${manifest.description}`,
      scriptHandler: 'Chrome Extension',
      version: manifest.version
    };
  }
};
