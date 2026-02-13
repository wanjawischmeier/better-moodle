// PDF indexing logic
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import * as pdfjsLib from 'pdfjs-dist';
import type { Index } from 'flexsearch';
import type { IndexedPage, PDFMetadata } from './types';

export class PDFIndexer {
    private indexedPages = new Map<string, IndexedPage>();
    private pdfMetadata = new Map<string, PDFMetadata>();
    private searchIndex: Index | undefined;
    private isCrawling = false;

    private readonly STORAGE_KEY = 'pdfSearchIndex';
    private readonly METADATA_KEY = 'pdfSearchMetadata';

    /**
     * Initialize the indexer with a FlexSearch index.
     *
     * @param index - The FlexSearch index instance
     */
    public setIndex(index: Index) {
        this.searchIndex = index;
    }

    /**
     * Get all indexed pages.
     *
     * @returns Map of indexed pages
     */
    public getIndexedPages(): Map<string, IndexedPage> {
        return this.indexedPages;
    }

    /**
     * Get PDF metadata.
     *
     * @returns Map of PDF metadata
     */
    public getPDFMetadata(): Map<string, PDFMetadata> {
        return this.pdfMetadata;
    }

    /**
     * Set crawling state.
     *
     * @param crawling - Whether currently crawling
     */
    public setCrawling(crawling: boolean) {
        this.isCrawling = crawling;
    }

    /**
     * Load index from localStorage.
     */
    public loadFromStorage(): void {
        console.log('[PDF Search] Loading index from localStorage');
        try {
            const storedData = localStorage.getItem(this.STORAGE_KEY);
            const storedMetadata = localStorage.getItem(this.METADATA_KEY);

            if (storedData && storedMetadata) {
                const pages = JSON.parse(storedData) as IndexedPage[];
                const metadata = JSON.parse(storedMetadata) as PDFMetadata[];

                console.log(`[PDF Search] Found ${pages.length} pages in storage`);
                console.log(`[PDF Search] Found ${metadata.length} PDFs in storage`);

                this.indexedPages.clear();
                this.pdfMetadata.clear();

                for (const page of pages) {
                    this.indexedPages.set(page.id, page);
                    this.searchIndex?.add(page.id, page.text);
                }

                for (const meta of metadata) {
                    this.pdfMetadata.set(meta.url, meta);
                }

                console.log('[PDF Search] Index loaded successfully');
            } else {
                console.log('[PDF Search] No stored index found');
            }
        } catch (error) {
            console.error('[PDF Search] Error loading index from storage:', error);
        }
    }

    /**
     * Save index to localStorage.
     */
    public saveToStorage(): void {
        console.log('[PDF Search] Saving index to localStorage');
        try {
            const pages = Array.from(this.indexedPages.values());
            const metadata = Array.from(this.pdfMetadata.values());

            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(pages));
            localStorage.setItem(this.METADATA_KEY, JSON.stringify(metadata));

            const sizeEstimate =
                JSON.stringify(pages).length + JSON.stringify(metadata).length;
            console.log(
                `[PDF Search] Index saved (approx ${(sizeEstimate / 1024).toFixed(2)} KB)`
            );
        } catch (error) {
            console.error('[PDF Search] Error saving index to storage:', error);
        }
    }

    /**
     * Clear the entire index.
     */
    public clearIndex(): void {
        console.log('[PDF Search] Clearing index');
        this.indexedPages.clear();
        this.pdfMetadata.clear();
        localStorage.removeItem(this.STORAGE_KEY);
        localStorage.removeItem(this.METADATA_KEY);
        console.log('[PDF Search] Index cleared');
    }

    /**
     * Index a PDF document.
     *
     * @param pdfUrl - URL of the PDF to index
     */
    public async indexPDF(pdfUrl: string): Promise<void> {
        console.log(`[PDF Search] Starting to index PDF: ${pdfUrl}`);

        // Skip if already indexed
        if (this.pdfMetadata.has(pdfUrl)) {
            console.log(`[PDF Search] PDF already indexed: ${pdfUrl}`);
            return;
        }

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
            this.pdfMetadata.set(pdfUrl, metadata);

            console.log(`[PDF Search] Processing ${pdf.numPages} pages...`);

            // Index each page
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                console.log(`[PDF Search] Processing page ${pageNum}/${pdf.numPages}`);

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

                this.indexedPages.set(id, indexedPage);
                this.searchIndex?.add(id, pageText);

                console.log(
                    `[PDF Search] Page ${pageNum} indexed (${pageText.length} chars)`
                );
            }

            const endTime = performance.now();
            console.log(
                `[PDF Search] PDF indexing complete in ${(endTime - startTime).toFixed(2)}ms`
            );

            this.saveToStorage();

            if (!this.isCrawling) {
                alert(`PDF indexed successfully!\n${pdf.numPages} pages processed.`);
            }
        } catch (error) {
            console.error('[PDF Search] Error indexing PDF:', error);
            if (!this.isCrawling) {
                alert(`Error indexing PDF: ${String(error)}`);
            }
        }
    }
}
