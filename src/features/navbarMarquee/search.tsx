import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import * as pdfjsLib from 'pdfjs-dist';
import { Index } from 'flexsearch';
import { BooleanSetting } from '#lib/Settings/BooleanSetting';
import Feature from '#lib/Feature';

const enabled = new BooleanSetting('enabled', true).addAlias('general.search');

console.log('[PDF Search] Initializing module');

// Types for our indexed data
interface IndexedPage {
    id: string; // format: "pdfUrl|pageNum"
    pdfUrl: string;
    pageNum: number;
    text: string;
}

interface PDFMetadata {
    url: string;
    title: string;
    pageCount: number;
    indexedAt: number;
}

// FlexSearch index
let searchIndex: Index | undefined;
const indexedPages = new Map<string, IndexedPage>();
const pdfMetadata = new Map<string, PDFMetadata>();

// Stats
const stats = { totalDocs: 0, totalPages: 0, indexSize: 0, lastQueryTime: 0 };

// UI elements
let container: HTMLDivElement | undefined;
let panel: HTMLDivElement | undefined;
let searchInput: HTMLInputElement | undefined;
let resultsContainer: HTMLUListElement | undefined;
let statsContainer: HTMLDivElement | undefined;
let pdfUrlInput: HTMLInputElement | undefined;

const STORAGE_KEY = 'pdfSearchIndex';
const METADATA_KEY = 'pdfSearchMetadata';

// Initialize FlexSearch index
const initIndex = () => {
    console.log('[PDF Search] Initializing FlexSearch index');
    searchIndex = new Index({
        tokenize: 'forward',
        cache: true,
        context: { resolution: 9, depth: 3, bidirectional: true },
    });
    console.log('[PDF Search] FlexSearch index initialized');
};

// Load index from localStorage
const loadIndexFromStorage = () => {
    console.log('[PDF Search] Loading index from localStorage');
    try {
        const storedData = localStorage.getItem(STORAGE_KEY);
        const storedMetadata = localStorage.getItem(METADATA_KEY);

        if (storedData && storedMetadata) {
            const pages = JSON.parse(storedData) as IndexedPage[];
            const metadata = JSON.parse(storedMetadata) as PDFMetadata[];

            console.log(`[PDF Search] Found ${pages.length} pages in storage`);
            console.log(
                `[PDF Search] Found ${metadata.length} PDFs in storage`
            );

            // Rebuild index
            indexedPages.clear();
            pdfMetadata.clear();

            for (const page of pages) {
                indexedPages.set(page.id, page);
                searchIndex?.add(page.id, page.text);
            }

            for (const meta of metadata) {
                pdfMetadata.set(meta.url, meta);
            }

            updateStats();
            console.log('[PDF Search] Index loaded successfully');
        } else {
            console.log('[PDF Search] No stored index found');
        }
    } catch (error) {
        console.error('[PDF Search] Error loading index from storage:', error);
    }
};

// Save index to localStorage
const saveIndexToStorage = () => {
    console.log('[PDF Search] Saving index to localStorage');
    try {
        const pages = Array.from(indexedPages.values());
        const metadata = Array.from(pdfMetadata.values());

        localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
        localStorage.setItem(METADATA_KEY, JSON.stringify(metadata));

        const sizeEstimate =
            JSON.stringify(pages).length + JSON.stringify(metadata).length;
        console.log(
            `[PDF Search] Index saved (approx ${(sizeEstimate / 1024).toFixed(2)} KB)`
        );
    } catch (error) {
        console.error('[PDF Search] Error saving index to storage:', error);
    }
};

// Update stats
const updateStats = () => {
    stats.totalDocs = pdfMetadata.size;
    stats.totalPages = indexedPages.size;
    stats.indexSize = new Blob([
        JSON.stringify(Array.from(indexedPages.values())),
    ]).size;

    if (statsContainer) {
        statsContainer.innerHTML = `
            <small>
                <strong>Stats:</strong> ${stats.totalDocs} PDFs, 
                ${stats.totalPages} pages, 
                ${(stats.indexSize / 1024).toFixed(2)} KB, 
                Query: ${stats.lastQueryTime.toFixed(2)}ms
            </small>
        `;
    }
    console.log('[PDF Search] Stats updated:', stats);
};

// Index a PDF
const indexPDF = async (pdfUrl: string) => {
    console.log(`[PDF Search] Starting to index PDF: ${pdfUrl}`);
    const startTime = performance.now();

    try {
        console.log(`[PDF Search] Fetching PDF from ${pdfUrl}`);
        const loadingTask = pdfjsLib.getDocument({ url: pdfUrl });
        const pdf = await loadingTask.promise;

        console.log(`[PDF Search] PDF loaded, ${pdf.numPages} pages`);

        // Store metadata
        const metadata: PDFMetadata = {
            url: pdfUrl,
            title: pdfUrl.split('/').pop() ?? 'Unknown',
            pageCount: pdf.numPages,
            indexedAt: Date.now(),
        };
        pdfMetadata.set(pdfUrl, metadata);

        console.log(`[PDF Search] Processing ${pdf.numPages} pages...`);

        // Index each page
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            console.log(
                `[PDF Search] Processing page ${pageNum}/${pdf.numPages}`
            );

            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();

            const pageText = textContent.items
                .filter((item): item is TextItem => 'str' in item)
                .map(item => item.str)
                .join(' ');

            const id = `${pdfUrl}|${pageNum}`;
            const indexedPage: IndexedPage = {
                id,
                pdfUrl,
                pageNum,
                text: pageText,
            };

            indexedPages.set(id, indexedPage);
            searchIndex?.add(id, pageText);

            console.log(
                `[PDF Search] Page ${pageNum} indexed (${pageText.length} chars)`
            );
        }

        const endTime = performance.now();
        console.log(
            `[PDF Search] PDF indexing complete in ${(endTime - startTime).toFixed(2)}ms`
        );

        // Save to storage
        saveIndexToStorage();
        updateStats();

        alert(`PDF indexed successfully!\n${pdf.numPages} pages processed.`);
    } catch (error) {
        console.error('[PDF Search] Error indexing PDF:', error);
        alert(`Error indexing PDF: ${String(error)}`);
    }
};

// Perform search
const performSearch = (query: string) => {
    console.log(`[PDF Search] Performing search for: "${query}"`);
    const startTime = performance.now();

    if (!searchIndex || query.trim().length === 0) {
        console.log('[PDF Search] Empty query or no index');
        renderResults([]);
        return;
    }

    try {
        const results = searchIndex.search(query, { limit: 20 }) as string[];
        const endTime = performance.now();
        stats.lastQueryTime = endTime - startTime;

        console.log(
            `[PDF Search] Found ${results.length} results in ${stats.lastQueryTime.toFixed(2)}ms`
        );
        console.log('[PDF Search] Result IDs:', results);

        renderResults(results);
        updateStats();
    } catch (error) {
        console.error('[PDF Search] Search error:', error);
        renderResults([]);
    }
};

// Render search results
const renderResults = (resultIds: string[]) => {
    console.log(`[PDF Search] Rendering ${resultIds.length} results`);

    if (!resultsContainer) return;

    resultsContainer.innerHTML = '';

    if (resultIds.length === 0) {
        const li = (
            <li className="list-group-item text-muted">No results found</li>
        );
        resultsContainer.appendChild(li);
        return;
    }

    for (const id of resultIds) {
        const page = indexedPages.get(id);
        if (!page) {
            console.warn(`[PDF Search] Page not found for id: ${id}`);
            continue;
        }

        const preview = `${page.text.substring(0, 100)}...`;

        const li = (
            <li
                className="list-group-item list-group-item-action"
                style={{ cursor: 'pointer' }}
            >
                <strong>
                    {page.pdfUrl.split('/').pop() ?? 'Unknown'} - Page{' '}
                    {page.pageNum}
                </strong>
                <br />
                <small className="text-muted">{preview}</small>
            </li>
        ) as HTMLLIElement;

        li.addEventListener('click', () => {
            console.log(
                `[PDF Search] Opening PDF ${page.pdfUrl} at page ${page.pageNum}`
            );
            // Open PDF at specific page (works in most browsers)
            window.open(`${page.pdfUrl}#page=${page.pageNum}`, '_blank');
        });

        resultsContainer.appendChild(li);
    }
};

const togglePanel = (show: boolean) => {
    if (!panel) return;
    panel.style.display = show ? 'block' : 'none';
    console.log(`[PDF Search] Panel ${show ? 'shown' : 'hidden'}`);
};

const createElements = () => {
    console.log('[PDF Search] Creating UI elements');

    // Results container
    resultsContainer = (
        <ul
            className="list-group list-group-flush"
            style={{ maxHeight: '300px', overflowY: 'auto' }}
        >
            <li className="list-group-item text-muted">
                Enter a search query or add a PDF below
            </li>
        </ul>
    ) as HTMLUListElement;

    // Stats container
    statsContainer = (
        <div className="border-top pt-2 mt-2">
            <small>
                <strong>Stats:</strong> {stats.totalDocs} PDFs,{' '}
                {stats.totalPages} pages, {(stats.indexSize / 1024).toFixed(2)}{' '}
                KB
            </small>
        </div>
    ) as HTMLDivElement;

    // PDF URL input
    pdfUrlInput = (
        <input
            id="pdf-url-input"
            type="text"
            className="form-control form-control-sm"
            placeholder="Enter PDF URL to index..."
        />
    ) as HTMLInputElement;

    const addPdfButton = (
        <button className="btn btn-primary btn-sm">Add PDF</button>
    ) as HTMLButtonElement;

    addPdfButton.addEventListener('click', () => {
        const url = pdfUrlInput?.value.trim();
        if (url) {
            console.log(`[PDF Search] User requested to index: ${url}`);
            void indexPDF(url);
            if (pdfUrlInput) pdfUrlInput.value = '';
        }
    });

    // Search Panel
    panel = (
        <div
            className="card position-absolute shadow"
            style={{
                top: '100%',
                right: '0',
                width: '400px',
                zIndex: '1000',
                display: 'none',
                marginTop: '0.5rem',
                color: 'initial',
            }}
        >
            <div className="card-body">
                <h5 className="card-title">PDF Search</h5>
                {resultsContainer}
                <div className="border-top pt-2 mt-2">
                    <label className="form-label mb-1" htmlFor="pdf-url-input">
                        <small>Add PDF to index:</small>
                    </label>
                    <div className="input-group input-group-sm">
                        {pdfUrlInput}
                        <div className="input-group-append">{addPdfButton}</div>
                    </div>
                </div>
                {statsContainer}
            </div>
        </div>
    ) as HTMLDivElement;

    // Search Input
    searchInput = (
        <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Search PDFs..."
            style={{ width: '200px' }}
        />
    ) as HTMLInputElement;

    searchInput.addEventListener('focus', () => togglePanel(true));
    searchInput.addEventListener('input', e => {
        const query = (e.target as HTMLInputElement).value;
        void performSearch(query);
    });

    // Container
    container = (
        <div className="nav-item d-flex align-items-center ml-2 position-relative">
            <i
                className="fa fa-search mr-2"
                aria-hidden="true"
                style={{ fontSize: '1.2em' }}
            ></i>
            {searchInput}
            {panel}
        </div>
    ) as HTMLDivElement;

    // Add close listener for clicking outside
    document.addEventListener('click', e => {
        if (!container?.contains(e.target as Node)) {
            togglePanel(false);
        }
    });

    console.log('[PDF Search] UI elements created');
};

const onload = () => {
    console.log('[PDF Search] Feature loading...');

    if (enabled.value) {
        // Configure worker dynamically (only once)
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            void import('pdfjs-dist/build/pdf.worker.min.mjs?url')
                .then(worker => {
                    pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default;
                    console.log(
                        '[PDF Search] Worker configured:',
                        pdfjsLib.GlobalWorkerOptions.workerSrc
                    );
                })
                .catch(error => {
                    console.error('[PDF Search] Failed to load worker:', error);
                });
        }

        if (!searchIndex) {
            initIndex();
            loadIndexFromStorage();
        }

        if (!container) createElements();
        document.getElementById('usernavigation')?.append(container!);

        console.log('[PDF Search] Feature loaded successfully');
    } else {
        container?.remove();
        console.log('[PDF Search] Feature disabled');
    }
};

const onunload = () => {
    console.log('[PDF Search] Feature unloading');
    container?.remove();
};

enabled.onInput(onload);

export default Feature.register({
    settings: new Set([enabled]),
    onload,
    onunload,
});
