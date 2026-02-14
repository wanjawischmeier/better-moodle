// PDF indexing logic
import * as pdfjsLib from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { Index } from 'flexsearch';
import type { CourseTag, IndexedPage, PDFMetadata } from './types';

/**
 * PDF indexer class.
 */
export class PDFIndexer {
    private indexedPages = new Map<string, IndexedPage>();
    private pdfMetadata = new Map<string, PDFMetadata>();
    private searchIndex: Index | undefined;
    private isCrawling = false;
    private onIndexUpdate?: () => void;
    private saveTimeout?: ReturnType<typeof setTimeout>;

    private readonly STORAGE_KEY = 'pdfSearchIndex';
    private readonly METADATA_KEY = 'pdfSearchMetadata';

    /**
     * Initialize the indexer with a FlexSearch index.

     * @param index - The FlexSearch index instance
     */
    public setIndex(index: Index) {
        this.searchIndex = index;
    }

    /**
     * Set callback to be called when index is updated.
     * @param callback - Function to call after index updates
     */
    public setOnIndexUpdate(callback: () => void) {
        this.onIndexUpdate = callback;
    }

    /**
     * Get all indexed pages.
     * @returns Map of indexed pages
     */
    public getIndexedPages(): Map<string, IndexedPage> {
        return this.indexedPages;
    }

    /**
     * Get PDF metadata.
     * @returns Map of PDF metadata
     */
    public getPDFMetadata(): Map<string, PDFMetadata> {
        return this.pdfMetadata;
    }

    /**
     * Set crawling state.

     * @param crawling - Whether currently crawling
     */
    public setCrawling(crawling: boolean) {
        this.isCrawling = crawling;
        // Force save when crawling ends
        if (!crawling && this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveToStorageNow();
        }
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
     * Save index to localStorage (debounced during crawling).
     */
    public saveToStorage(): void {
        // Debounce saves during crawling to avoid blocking UI
        if (this.isCrawling) {
            if (this.saveTimeout) {
                clearTimeout(this.saveTimeout);
            }
            this.saveTimeout = setTimeout(() => {
                this.saveToStorageNow();
            }, 3000); // Save every 3 seconds max during crawl
        } else {
            this.saveToStorageNow();
        }
    }

    /**
     * Actually perform the save to localStorage.
     */
    private saveToStorageNow(): void {
        console.log('[PDF Search] Saving index to localStorage');
        try {
            const pages = Array.from(this.indexedPages.values());
            const metadata = Array.from(this.pdfMetadata.values());

            const pagesJson = JSON.stringify(pages);
            const metadataJson = JSON.stringify(metadata);
            const totalSize = pagesJson.length + metadataJson.length;

            // Check if approaching localStorage limit (assume ~5MB limit)
            if (totalSize > 4.5 * 1024 * 1024) {
                console.warn(
                    `[PDF Search] Index size (${(totalSize / 1024 / 1024).toFixed(2)} MB) is approaching localStorage limit!`
                );
            }

            localStorage.setItem(this.STORAGE_KEY, pagesJson);
            localStorage.setItem(this.METADATA_KEY, metadataJson);

            console.log(
                `[PDF Search] Index saved (approx ${(totalSize / 1024).toFixed(2)} KB)`
            );
        } catch (error) {
            if (error instanceof DOMException && error.name === 'QuotaExceededError') {
                console.error('[PDF Search] localStorage quota exceeded!');
            } else {
                console.error('[PDF Search] Error saving index to storage:', error);
            }
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
        
        // Notify that index was updated
        this.onIndexUpdate?.();
    }

    /**
     * Index a PDF document.
     * @param pdfUrl - URL of the PDF to index
     * @param tags - Tags to associate with this PDF (e.g., course names)
     */
    public async indexPDF(pdfUrl: string, tags: CourseTag[] = []): Promise<void> {
        console.log(`[PDF Search] Starting to index PDF: ${pdfUrl} with tags:`, tags);

        // Skip if already indexed
        if (this.pdfMetadata.has(pdfUrl)) {
            console.log(`[PDF Search] PDF already indexed: ${pdfUrl}`);
            return;
        }

        const startTime = performance.now();

        let loadingTask;
        let pdf;

        try {
            console.log(`[PDF Search] Fetching PDF from ${pdfUrl}`);
            loadingTask = pdfjsLib.getDocument({ url: pdfUrl });
            pdf = await loadingTask.promise;

            console.log(`[PDF Search] PDF loaded, ${pdf.numPages} pages`);

            // Skip PDFs with too many pages to prevent memory issues
            if (pdf.numPages > 100) {
                console.warn(`[PDF Search] Skipping PDF with ${pdf.numPages} pages (limit: 100)`);
                await pdf.cleanup();
                await pdf.destroy();

                if (loadingTask) {
                    void loadingTask.destroy();
                }
                return;
            }

            // Store metadata
            const metadata: PDFMetadata = {
                url: pdfUrl,
                title: pdfUrl.split('/').pop() ?? 'Unknown',
                pageCount: pdf.numPages,
                indexedAt: Date.now(),
                tags,
            };
            this.pdfMetadata.set(pdfUrl, metadata);

            console.log(`[PDF Search] Processing ${pdf.numPages} pages...`);

            // Index each page
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                console.log(`[PDF Search] Processing page ${pageNum}/${pdf.numPages}`);

                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();

                // Yield to browser every 5 pages to prevent UI freezing
                if (pageNum % 5 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }

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
                    tags,
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

            // Clean up PDF document to free memory
            await pdf.cleanup();
            await pdf.destroy();

            // Destroy the loading task and its worker
            if (loadingTask) {
                void loadingTask.destroy();
            }

            this.saveToStorage();

            if (!this.isCrawling) {
                alert(`PDF indexed successfully!\n${pdf.numPages} pages processed.`);
            }
            
            // Notify that index was updated
            this.onIndexUpdate?.();
        } catch (error) {
            console.error('[PDF Search] Error indexing PDF:', error);
            
            // Clean up on error too
            if (pdf) {
                try {
                    await pdf.cleanup();
                    await pdf.destroy();
                } catch (cleanupError) {
                    console.error('[PDF Search] Error during cleanup:', cleanupError);
                }
            }
            if (loadingTask) {
                try {
                    void loadingTask.destroy();
                } catch (destroyError) {
                    console.error('[PDF Search] Error destroying loading task:', destroyError);
                }
            }
            
            if (!this.isCrawling) {
                alert(`Error indexing PDF: ${String(error)}`);
            }
        }
    }
}
