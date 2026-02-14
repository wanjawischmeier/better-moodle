// Search logic
import type { Index } from 'flexsearch';
import type { IndexedPage, SearchStats, CourseTag } from './types';

/**
 * Search engine for PDF content with tag filtering.
 */
export class SearchEngine {
    private searchIndex: Index | undefined;
    private indexedPages: Map<string, IndexedPage> | undefined;
    private activeTags = new Set<string>();
    private stats: SearchStats = {
        totalDocs: 0,
        totalPages: 0,
        indexSize: 0,
        lastQueryTime: 0,
    };

    /**
     * Set the FlexSearch index.
     * @param index - The FlexSearch index instance
     */
    public setIndex(index: Index) {
        this.searchIndex = index;
    }

    /**
     * Set the indexed pages map for filtering.
     * @param pages - Map of indexed pages
     */
    public setIndexedPages(pages: Map<string, IndexedPage>) {
        this.indexedPages = pages;
    }

    /**
     * Set active tag filters.
     * @param tags - Set of active tag names to filter by
     */
    public setActiveTags(tags: Set<string>) {
        this.activeTags = tags;
        console.log('[PDF Search] Active tags set:', Array.from(tags));
    }

    /**
     * Get all unique tags from indexed pages.
     * @returns Array of unique course tags
     */
    public getAllTags(): CourseTag[] {
        if (!this.indexedPages) {
            console.log('[PDF Search] getAllTags: No indexed pages');
            return [];
        }
        
        const tagsMap = new Map<string, CourseTag>();
        for (const page of this.indexedPages.values()) {
            for (const tag of page.tags) {
                if (!tagsMap.has(tag.name)) {
                    tagsMap.set(tag.name, tag);
                }
            }
        }
        
        const result = Array.from(tagsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        console.log(`[PDF Search] getAllTags: Found ${result.length} unique tags:`, result);
        return result;
    }

    /**
     * Get current search stats.
     * @returns Current search statistics
     */
    public getStats(): SearchStats {
        return this.stats;
    }

    /**
     * Update search statistics.
     * @param totalDocs - Number of indexed documents
     * @param totalPages - Number of indexed pages
     * @param indexSize - Size of the index in bytes
     */
    public updateStats(totalDocs: number, totalPages: number, indexSize: number) {
        this.stats.totalDocs = totalDocs;
        this.stats.totalPages = totalPages;
        this.stats.indexSize = indexSize;
        console.log('[PDF Search] Stats updated:', this.stats);
    }

    /**
     * Perform a search query with tag filtering.
     * @param query - Search query string
     * @returns Array of result IDs
     */
    public search(query: string): string[] {
        console.log(`[PDF Search] Performing search for: "${query}"`);
        const startTime = performance.now();

        if (!this.searchIndex || query.trim().length === 0) {
            console.log('[PDF Search] Empty query or no index');
            return [];
        }

        try {
            const results = this.searchIndex.search(query, { limit: 100 }) as string[];
            
            // Filter by active tags if any are selected
            let filteredResults = results;
            if (this.activeTags.size > 0 && this.indexedPages) {
                filteredResults = results.filter(id => {
                    const page = this.indexedPages!.get(id);
                    if (!page) return false;
                    
                    // Check if page has any of the active tags (by name)
                    return page.tags.some(tag => this.activeTags.has(tag.name));
                });
                console.log(`[PDF Search] Filtered from ${results.length} to ${filteredResults.length} results by tags`);
            }
            
            // Limit final results
            filteredResults = filteredResults.slice(0, 20);
            
            const endTime = performance.now();
            this.stats.lastQueryTime = endTime - startTime;

            console.log(
                `[PDF Search] Found ${filteredResults.length} results in ${this.stats.lastQueryTime.toFixed(2)}ms`
            );
            console.log('[PDF Search] Result IDs:', filteredResults);

            return filteredResults;
        } catch (error) {
            console.error('[PDF Search] Search error:', error);
            return [];
        }
    }
}
