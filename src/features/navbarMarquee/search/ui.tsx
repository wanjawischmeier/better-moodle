// UI components for PDF search
import { crawlCourse, getCurrentPageUrl, isCourseViewPage } from './crawler';
import type { PDFIndexer } from './indexing';
import type { SearchEngine } from './search';

export class SearchUI {
    private container: HTMLDivElement | undefined;
    private panel: HTMLDivElement | undefined;
    private searchInput: HTMLInputElement | undefined;
    private searchHint: HTMLInputElement | undefined;
    private resultsContainer: HTMLUListElement | undefined;
    private statsContainer: HTMLDivElement | undefined;
    private crawlButton: HTMLButtonElement | undefined;
    private crawlProgress: HTMLDivElement | undefined;
    private deleteButton: HTMLButtonElement | undefined;
    private currentQuery = '';

    private indexer: PDFIndexer;
    private searchEngine: SearchEngine;

    /**
     * Create a new SearchUI instance.
     *
     * @param indexer - The PDF indexer instance
     * @param searchEngine - The search engine instance
     */
    public constructor(indexer: PDFIndexer, searchEngine: SearchEngine) {
        this.indexer = indexer;
        this.searchEngine = searchEngine;
    }

    /**
     * Toggle the search panel visibility.
     *
     * @param show - Whether to show the panel
     */
    private togglePanel(show: boolean): void {
        if (!this.panel) return;
        this.panel.style.display = show ? 'block' : 'none';
        console.log(`[PDF Search] Panel ${show ? 'shown' : 'hidden'}`);
    }

    /**
     * Update the stats display.
     */
    public updateStatsDisplay(): void {
        if (!this.statsContainer) return;

        const stats = this.searchEngine.getStats();
        this.statsContainer.innerHTML = `
            <small>
                <strong>Stats:</strong> ${stats.totalDocs} PDFs, 
                ${stats.totalPages} pages, 
                ${(stats.indexSize / 1024).toFixed(2)} KB, 
                Query: ${stats.lastQueryTime.toFixed(2)}ms
            </small>
        `;
    }

    /**
     * Get clean filename without URL parameters.
     *
     * @param url - Full URL
     * @returns Clean filename
     */
    private getCleanFilename(url: string): string {
        const filename = url.split('/').pop() ?? 'Unknown';
        // Remove query parameters and hash
        return filename.split('?')[0].split('#')[0];
    }

    /**
     * Highlight query matches in text.
     *
     * @param text - Text to highlight
     * @param query - Query to highlight
     * @returns HTML string with highlighted matches
     */
    private highlightMatches(text: string, query: string): string {
        if (!query) return text;
        
        const words = query.split(/\s+/).filter(w => w.length > 0);
        let result = text;
        
        for (const word of words) {
            const regex = new RegExp(`(${word})`, 'gi');
            result = result.replace(regex, '<mark>$1</mark>');
        }
        
        return result;
    }

    /**
     * Get snippet of text centered around the query match.
     *
     * @param text - Full text
     * @param query - Search query
     * @param maxLength - Maximum snippet length
     * @returns Text snippet starting near the match
     */
    private getSnippet(text: string, query: string, maxLength = 150): string {
        if (!query) return text.substring(0, maxLength);

        const queryWords = query.split(/\s+/).filter(w => w.length > 0);
        if (queryWords.length === 0) return text.substring(0, maxLength);

        // Find the first occurrence of any query word
        let matchIndex = -1;
        for (const word of queryWords) {
            const index = text.toLowerCase().indexOf(word.toLowerCase());
            if (index !== -1 && (matchIndex === -1 || index < matchIndex)) {
                matchIndex = index;
            }
        }

        // If no match found, return from start
        if (matchIndex === -1) return text.substring(0, maxLength);

        // Start snippet slightly before the match (for context)
        const contextBefore = 20;
        const start = Math.max(0, matchIndex - contextBefore);
        
        // Extract snippet
        let snippet = text.substring(start, start + maxLength);
        
        // Add ellipsis if not starting from beginning
        if (start > 0) {
            snippet = `...${  snippet.trimStart()}`;
        }

        return snippet;
    }

    /**
     * Render search results.
     *
     * @param resultIds - Array of result IDs to render
     */
    private renderResults(resultIds: string[]): void {
        console.log(`[PDF Search] Rendering ${resultIds.length} results`);

        if (!this.resultsContainer) return;

        this.resultsContainer.innerHTML = '';

        if (resultIds.length === 0) {
            const li = <li className="list-group-item text-muted">No results found</li>;
            this.resultsContainer.appendChild(li);
            return;
        }

        const indexedPages = this.indexer.getIndexedPages();

        for (const id of resultIds) {
            const page = indexedPages.get(id);
            if (!page) {
                console.warn(`[PDF Search] Page not found for id: ${id}`);
                continue;
            }

            const snippet = this.getSnippet(page.text, this.currentQuery, 150);
            const highlightedPreview = this.highlightMatches(snippet, this.currentQuery);

            const li = (
                <li
                    className="list-group-item list-group-item-action"
                    style={{ cursor: 'pointer' }}
                >
                    <strong>
                        {this.getCleanFilename(page.pdfUrl)} - Page {page.pageNum}
                    </strong>
                    <br />
                    <small className="text-muted" />
                </li>
            ) as HTMLLIElement;

            const previewElement = li.querySelector('small');
            if (previewElement) {
                previewElement.innerHTML = highlightedPreview;
                // Only add trailing ellipsis if snippet doesn't already start with one
                if (!snippet.startsWith('...')) {
                    previewElement.innerHTML += '...';
                }
            }

            li.addEventListener('click', () => {
                console.log(
                    `[PDF Search] Opening PDF ${page.pdfUrl} at page ${page.pageNum}`
                );
                window.open(`${page.pdfUrl}#page=${page.pageNum}`, '_blank');
            });

            this.resultsContainer.appendChild(li);
        }
    }

    /**
     * Update autocomplete hint.
     *
     * @param query - Current query
     */
    private updateHint(query: string): void {
        if (!this.searchHint || !query) {
            if (this.searchHint) this.searchHint.value = '';
            return;
        }

        const results = this.searchEngine.search(query);
        if (results.length === 0) {
            this.searchHint.value = '';
            return;
        }

        const indexedPages = this.indexer.getIndexedPages();
        const topResult = indexedPages.get(results[0]);
        if (!topResult) return;

        // Split query into words and get the last word being typed
        const queryWords = query.split(/\s+/);
        const lastWord = queryWords[queryWords.length - 1];
        
        if (!lastWord) {
            this.searchHint.value = '';
            return;
        }

        // Find first word in result that starts with the last query word
        const words = topResult.text.split(/\s+/);
        for (const word of words) {
            const cleanWord = word.replace(/[^a-zA-Z0-9]/g, '');
            if (cleanWord.toLowerCase().startsWith(lastWord.toLowerCase()) && cleanWord.length > lastWord.length) {
                // Replace the last word with the completed version
                const completedWords = [...queryWords.slice(0, -1), cleanWord];
                this.searchHint.value = completedWords.join(' ');
                return;
            }
        }

        this.searchHint.value = '';
    }

    /**
     * Perform search and render results.
     *
     * @param query - Search query
     */
    private performSearch(query: string): void {
        this.currentQuery = query;
        const results = this.searchEngine.search(query);
        this.renderResults(results);
        this.updateStatsDisplay();
        this.updateHint(query);
    }

    /**
     * Start crawling the current course.
     */
    private async startCrawl(): Promise<void> {
        console.log('[PDF Search] Starting course crawl');
        this.indexer.setCrawling(true);

        if (this.crawlButton) {
            this.crawlButton.disabled = true;
            this.crawlButton.textContent = 'Crawling...';
        }

        if (this.crawlProgress) {
            this.crawlProgress.style.display = 'block';
        }

        const startUrl = getCurrentPageUrl();

        try {
            await crawlCourse(
                startUrl,
                progress => {
                    console.log('[PDF Search] Crawl progress:', progress);
                    if (this.crawlProgress) {
                        this.crawlProgress.innerHTML = `
                            <small>
                                <strong>Progress:</strong><br/>
                                Pages: ${progress.crawledPages}/${progress.totalPages}<br/>
                                PDFs: ${progress.indexedPDFs}/${progress.totalPDFs}<br/>
                                <span class="text-truncate d-block" style="max-width: 350px;">
                                    ${progress.currentUrl}
                                </span>
                            </small>
                        `;
                    }
                },
                url => this.indexer.indexPDF(url)
            );

            console.log('[PDF Search] Crawl complete');
            alert('Course crawl complete! All PDFs have been indexed.');
        } catch (error) {
            console.error('[PDF Search] Crawl error:', error);
            alert(`Crawl error: ${String(error)}`);
        } finally {
            this.indexer.setCrawling(false);
            if (this.crawlButton) {
                this.crawlButton.disabled = false;
                this.crawlButton.textContent = 'Crawl Course';
            }
            if (this.crawlProgress) {
                this.crawlProgress.style.display = 'none';
            }
        }
    }

    /**
     * Create all UI elements.
     */
    public createElements(): void {
        console.log('[PDF Search] Creating UI elements');

        // Results container with scrollbar
        this.resultsContainer = (
            <ul
                className="list-group list-group-flush"
                style={{ 
                    maxHeight: '400px', 
                    overflowY: 'auto',
                    scrollbarWidth: 'thin'
                }}
            >
                <li className="list-group-item text-muted">
                    Enter a search query to search indexed PDFs
                </li>
            </ul>
        ) as HTMLUListElement;

        // Stats container
        const stats = this.searchEngine.getStats();
        this.statsContainer = (
            <div className="border-top pt-2 mt-2">
                <small>
                    <strong>Stats:</strong> {stats.totalDocs} PDFs, {stats.totalPages}{' '}
                    pages, {(stats.indexSize / 1024).toFixed(2)} KB
                </small>
            </div>
        ) as HTMLDivElement;

        // Delete index button
        this.deleteButton = (
            <button className="btn btn-danger btn-sm">
                <i className="fa fa-trash mr-1" aria-hidden="true"></i>
                Clear Index
            </button>
        ) as HTMLButtonElement;

        this.deleteButton.addEventListener('click', () => {
            if (confirm('Are you sure you want to delete the entire search index? This cannot be undone.')) {
                this.indexer.clearIndex();
                this.performSearch('');
                this.updateStatsDisplay();
                alert('Search index cleared successfully.');
            }
        });

        // Crawl button (only show on course pages)
        const showCrawlButton = isCourseViewPage();
        console.log('[PDF Search] Show crawl button:', showCrawlButton);

        if (showCrawlButton) {
            this.crawlButton = (
                <button className="btn btn-success btn-sm mt-2">
                    <i className="fa fa-sitemap mr-1" aria-hidden="true"></i>
                    Crawl Course
                </button>
            ) as HTMLButtonElement;

            this.crawlButton.addEventListener('click', () => {
                void this.startCrawl();
            });

            // Crawl progress indicator
            this.crawlProgress = (
                <div
                    className="alert alert-info mt-2 mb-0"
                    style={{
                        display: 'none',
                        fontSize: '0.85rem',
                        padding: '0.5rem',
                    }}
                >
                    <small>Starting crawl...</small>
                </div>
            ) as HTMLDivElement;
        }

        // Search Panel
        this.panel = (
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
                    {this.resultsContainer}
                    {showCrawlButton && (
                        <div className="border-top pt-2 mt-2">
                            <div className="d-flex gap-2">
                                {this.crawlButton}
                                {this.deleteButton}
                            </div>
                            {this.crawlProgress}
                        </div>
                    )}
                    {!showCrawlButton && (
                        <div className="border-top pt-2 mt-2">
                            {this.deleteButton}
                        </div>
                    )}
                    {this.statsContainer}
                </div>
            </div>
        ) as HTMLDivElement;

        // Search Input with autocomplete hint
        const searchWrapper = (
            <div style={{ position: 'relative', width: '200px' }} />
        ) as HTMLDivElement;

        this.searchHint = (
            <input
                type="text"
                className="form-control form-control-sm"
                style={{
                    position: 'absolute',
                    top: '0',
                    left: '0',
                    width: '100%',
                    color: '#999',
                    backgroundColor: 'transparent',
                    pointerEvents: 'none',
                    border: 'none'
                }}
                disabled
            />
        ) as HTMLInputElement;

        this.searchInput = (
            <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Search PDFs..."
                style={{
                    position: 'relative',
                    width: '100%',
                    backgroundColor: 'transparent'
                }}
            />
        ) as HTMLInputElement;

        searchWrapper.appendChild(this.searchHint);
        searchWrapper.appendChild(this.searchInput);

        this.searchInput.addEventListener('focus', () => this.togglePanel(true));
        this.searchInput.addEventListener('input', e => {
            const query = (e.target as HTMLInputElement).value;
            this.performSearch(query);
        });
        
        // Accept hint on Tab key
        this.searchInput.addEventListener('keydown', e => {
            if (e.key === 'Tab' && this.searchHint?.value) {
                e.preventDefault();
                this.searchInput!.value = this.searchHint.value;
                this.performSearch(this.searchHint.value);
            }
        });

        // Container
        this.container = (
            <div className="nav-item d-flex align-items-center ml-2 position-relative">
                <i
                    className="fa fa-search mr-2"
                    aria-hidden="true"
                    style={{ fontSize: '1.2em' }}
                ></i>
                {searchWrapper}
                {this.panel}
            </div>
        ) as HTMLDivElement;

        // Add close listener for clicking outside
        document.addEventListener('click', e => {
            if (!this.container?.contains(e.target as Node)) {
                this.togglePanel(false);
            }
        });

        console.log('[PDF Search] UI elements created');
    }

    /**
     * Get the main container element.
     *
     * @returns The container element
     */
    public getContainer(): HTMLDivElement | undefined {
        return this.container;
    }

    /**
     * Remove the UI from the DOM.
     */
    public remove(): void {
        this.container?.remove();
    }
}
