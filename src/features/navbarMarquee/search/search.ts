// Search logic
import type { Index } from 'flexsearch';
import type { SearchStats } from './types';

export class SearchEngine {
    private searchIndex: Index | undefined;
    private stats: SearchStats = {
        totalDocs: 0,
        totalPages: 0,
        indexSize: 0,
        lastQueryTime: 0,
    };

    /**
     * Set the FlexSearch index.
     *
     * @param index - The FlexSearch index instance
     */
    public setIndex(index: Index) {
        this.searchIndex = index;
    }

    /**
     * Get current search stats.
     *
     * @returns Current search statistics
     */
    public getStats(): SearchStats {
        return this.stats;
    }

    /**
     * Update search statistics.
     *
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
     * Perform a search query.
     *
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
            const results = this.searchIndex.search(query, { limit: 20 }) as string[];
            const endTime = performance.now();
            this.stats.lastQueryTime = endTime - startTime;

            console.log(
                `[PDF Search] Found ${results.length} results in ${this.stats.lastQueryTime.toFixed(2)}ms`
            );
            console.log('[PDF Search] Result IDs:', results);

            return results;
        } catch (error) {
            console.error('[PDF Search] Search error:', error);
            return [];
        }
    }
}
