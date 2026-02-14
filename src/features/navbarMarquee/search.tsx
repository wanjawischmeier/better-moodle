// PDF Search Feature - with CDN-loaded PDF.js
import { BooleanSetting } from '#lib/Settings/BooleanSetting';
import Feature from '#lib/Feature';
import { Index } from 'flexsearch';
import { PDFIndexer } from './search/indexing';
import { SearchEngine } from './search/search';
import { SearchUI } from './search/ui';

const enabled = new BooleanSetting('enabled', true).addAlias('general.search');

// PDF.js will be loaded from CDN dynamically
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsLib: any = null;
let pdfjsLoaded = false;
let pdfjsLoadPromise: Promise<void> | null = null;

// Initialize search components
let searchIndex: Index | undefined;
let indexer: PDFIndexer | undefined;
let searchEngine: SearchEngine | undefined;
let ui: SearchUI | undefined;

/**
 * Load PDF.js from CDN dynamically by injecting a script into the page context
 * @returns Promise that resolves when PDF.js is loaded
 */
const loadPdfJs = async (): Promise<void> => {
    if (pdfjsLoaded) return;
    if (pdfjsLoadPromise) return pdfjsLoadPromise;

    pdfjsLoadPromise = (async () => {
        console.log('[PDF Search] 📦 Loading PDF.js from CDN...');

        try {
            // Inject script into page context (not userscript context)
            await new Promise<void>((resolve, reject) => {
                const script = document.createElement('script');
                script.type = 'module';
                script.textContent = `
                    import * as pdfjs from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/+esm';
                    
                    // Set worker
                    pdfjs.GlobalWorkerOptions.workerSrc = 
                        'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs';
                    
                    // Expose to global scope for userscript to access
                    window.__BETTER_MOODLE_PDFJS__ = pdfjs;
                    console.log('[PDF.js] ✅ Module exposed to window.__BETTER_MOODLE_PDFJS__');
                    
                    // Signal ready
                    window.dispatchEvent(new CustomEvent('better-moodle-pdfjs-loaded'));
                `;

                // Wait for the custom event with timeout
                // eslint-disable-next-line prefer-const
                let timeoutId: ReturnType<typeof setTimeout>;
                const handleLoaded = () => {
                    clearTimeout(timeoutId);
                    window.removeEventListener(
                        'better-moodle-pdfjs-loaded',
                        handleLoaded
                    );
                    console.log(
                        '[PDF Search] 🔔 Received load event, checking for module...'
                    );

                    // Give it a moment to ensure window property is set
                    setTimeout(() => resolve(), 150);
                };

                timeoutId = setTimeout(() => {
                    window.removeEventListener(
                        'better-moodle-pdfjs-loaded',
                        handleLoaded
                    );
                    reject(new Error('Timeout waiting for PDF.js to load'));
                }, 10000);

                window.addEventListener(
                    'better-moodle-pdfjs-loaded',
                    handleLoaded
                );
                script.onerror = () => {
                    clearTimeout(timeoutId);
                    reject(new Error('Failed to load PDF.js script'));
                };

                document.head.appendChild(script);
            });

            // Access PDF.js from unsafeWindow (page context) or window (fallback)
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
            const win =
                typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
            pdfjsLib = (win as any).__BETTER_MOODLE_PDFJS__;

            if (!pdfjsLib) {
                console.error('[PDF Search] ❌ Module not found. Debug info:', {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
                    onWindow: !!(window as any).__BETTER_MOODLE_PDFJS__,
                    hasUnsafeWindow: typeof unsafeWindow !== 'undefined',
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
                    onUnsafeWindow:
                        typeof unsafeWindow !== 'undefined' ?
                            !!(unsafeWindow as any).__BETTER_MOODLE_PDFJS__
                        :   'N/A',
                });
                throw new Error('PDF.js not found on window object');
            }

            pdfjsLoaded = true;
            console.log('[PDF Search] ✅ PDF.js loaded from CDN');
        } catch (error) {
            console.error(
                '[PDF Search] ❌ Failed to load PDF.js from CDN:',
                error
            );
            throw error;
        }
    })();

    return pdfjsLoadPromise;
};

/**
 * Initialize the FlexSearch index.
 */
const initIndex = (): void => {
    console.log('[PDF Search] Initializing FlexSearch index');
    searchIndex = new Index({
        tokenize: 'forward',
        cache: true,
        context: { resolution: 9, depth: 3, bidirectional: true },
    });
    console.log('[PDF Search] FlexSearch index initialized');
};

/**
 * Update search statistics.
 */
const updateStats = (): void => {
    if (!indexer || !searchEngine || !ui) return;

    const indexedPages = indexer.getIndexedPages();
    const pdfMetadata = indexer.getPDFMetadata();

    // Update search engine's reference to indexed pages for filtering
    searchEngine.setIndexedPages(indexedPages);

    const indexSize = new Blob([
        JSON.stringify(Array.from(indexedPages.values())),
    ]).size;

    searchEngine.updateStats(pdfMetadata.size, indexedPages.size, indexSize);
    ui.updateStatsDisplay();
};

/**
 * Feature load handler.
 */
const onload = (): void => {
    console.log('[PDF Search] 🚀 Feature enabled');

    if (enabled.value) {
        // Initialize UI immediately (doesn't need PDF.js)
        if (!searchIndex) {
            initIndex();
        }

        if (!indexer && searchIndex) {
            indexer = new PDFIndexer();
            indexer.setIndex(searchIndex);
            indexer.setOnIndexUpdate(() => {
                updateStats();
                ui?.initializeFilters();
            });
            // Don't load from storage yet - needs PDF.js
        }

        if (!searchEngine && searchIndex && indexer) {
            searchEngine = new SearchEngine();
            searchEngine.setIndex(searchIndex);
            searchEngine.setIndexedPages(indexer.getIndexedPages());
            updateStats();
        }

        if (!ui && indexer && searchEngine) {
            ui = new SearchUI(indexer, searchEngine);
            ui.createElements();
            ui.initializeFilters();
            updateStats();

            // Add to navigation immediately
            const container = ui.getContainer();
            if (container) {
                document.getElementById('usernavigation')?.append(container);
            }

            console.log('[PDF Search] ✅ Search UI added to page');
        }

        // Load PDF.js from CDN in background
        console.log(
            '[PDF Search] ⏰ Starting PDF.js load (4 sec delay for testing)'
        );

        void loadPdfJs()
            .then(() => {
                console.log('[PDF Search] 🎉 PDF.js ready!');
                // Now enable PDF functionality
                if (indexer) {
                    indexer.setPdfJsLib(pdfjsLib);
                    void indexer.loadFromStorage();
                }
            })
            .catch(error => {
                console.error('[PDF Search] ❌ Failed to load PDF.js:', error);
                console.log(
                    '[PDF Search] Search works, but PDF crawling disabled'
                );
            });

        console.log('[PDF Search] ✨ UI ready, PDF.js loading in background');
    } else {
        ui?.remove();
        console.log('[PDF Search] Feature disabled');
    }
};

/**
 * Feature unload handler.
 */
const onunload = (): void => {
    console.log('[PDF Search] Feature unloading');
    ui?.remove();
};

export default Feature.register({
    settings: new Set([enabled]),
    onload,
    onunload,
});
