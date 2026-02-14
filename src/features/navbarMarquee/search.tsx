// PDF Search Feature
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Index } from 'flexsearch';
import { BooleanSetting } from '#lib/Settings/BooleanSetting';
import Feature from '#lib/Feature';
import { PDFIndexer } from './search/indexing';
import { SearchEngine } from './search/search';
import { SearchUI } from './search/ui';

const enabled = new BooleanSetting('enabled', true).addAlias('general.search');

console.log('[PDF Search] Initializing module');

// Initialize search components
let searchIndex: Index | undefined;
let indexer: PDFIndexer | undefined;
let searchEngine: SearchEngine | undefined;
let ui: SearchUI | undefined;
let workerConfigured = false;

/**
 * Initialize the FlexSearch index.
 */
const initIndex = (): void => {
    console.log('[PDF Search] Initializing FlexSearch index');
    searchIndex = new Index({
        tokenize: 'forward',
        cache: true,
        context: {
            resolution: 9,
            depth: 3,
            bidirectional: true,
        },
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
    console.log('[PDF Search] Feature loading...');

    if (enabled.value) {
        // Configure PDF.js worker (only once)
        if (!workerConfigured) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
            workerConfigured = true;
            console.log('[PDF Search] Worker configured:', pdfjsLib.GlobalWorkerOptions.workerSrc);
        }

        // Initialize components
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
            indexer.loadFromStorage();
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
        }

        // Add to navigation
        const container = ui?.getContainer();
        if (container) {
            document.getElementById('usernavigation')?.append(container);
        }

        console.log('[PDF Search] Feature loaded successfully');
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

enabled.onInput(onload);

export default Feature.register({
    settings: new Set([enabled]),
    onload,
    onunload,
});
