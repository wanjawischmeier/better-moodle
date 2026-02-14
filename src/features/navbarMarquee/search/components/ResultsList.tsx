// Results list component
import type { PDFIndexer } from '../indexing';

/**
 * Results list component for displaying search results.
 */
export class ResultsList {
    private container: HTMLUListElement;
    private indexer: PDFIndexer;
    private currentQuery = '';
    private onSearchAllCourses: () => void;

    public constructor(indexer: PDFIndexer, onSearchAllCourses: () => void) {
        this.indexer = indexer;
        this.onSearchAllCourses = onSearchAllCourses;

        this.container = (
            <ul
                className="list-group list-group-flush"
                style={{
                    maxHeight: '400px',
                    overflowY: 'auto',
                    scrollbarWidth: 'none',
                }}
            >
                <li className="list-group-item text-muted">
                    Enter a search query to search indexed PDFs
                </li>
            </ul>
        ) as HTMLUListElement;
    }

    /**
     * Get clean filename without URL parameters.
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
            snippet = `...${snippet.trimStart()}`;
        }

        return snippet;
    }

    /**
     * Render search results.
     * @param resultIds - Array of result IDs to render
     * @param hasActiveFilters - Whether there are active tag filters
     */
    public render(resultIds: string[], hasActiveFilters: boolean): void {
        console.log(`[PDF Search] Rendering ${resultIds.length} results`);

        this.container.innerHTML = '';

        if (resultIds.length === 0) {
            const li = (
                <li className="list-group-item text-muted">
                    No results found.{' '}
                    {hasActiveFilters && (
                        <button
                            type="button"
                            className="btn btn-link p-0"
                            style={{ verticalAlign: 'baseline' }}
                            onClick={() => this.onSearchAllCourses()}
                        >
                            Search in all courses
                        </button>
                    )}
                </li>
            );
            this.container.appendChild(li);
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
            const highlightedPreview = this.highlightMatches(
                snippet,
                this.currentQuery
            );

            const li = (
                <li
                    className="list-group-item list-group-item-action"
                    style={{ cursor: 'pointer' }}
                >
                    <strong>
                        {this.getCleanFilename(page.pdfUrl)} - Page{' '}
                        {page.pageNum}
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

            this.container.appendChild(li);
        }
    }

    public setQuery(query: string): void {
        this.currentQuery = query;
    }

    public getElement(): HTMLUListElement {
        return this.container;
    }
}
