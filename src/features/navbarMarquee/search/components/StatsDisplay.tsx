// Stats display component
import type { SearchEngine } from '../search';

/**
 * Stats display component for showing search statistics.
 */
export class StatsDisplay {
    private container: HTMLDivElement;
    private searchEngine: SearchEngine;

    public constructor(searchEngine: SearchEngine) {
        this.searchEngine = searchEngine;

        const stats = this.searchEngine.getStats();
        this.container = (
            <div className="border-top pt-2 mt-2">
                <small>
                    <strong>Stats:</strong> {stats.totalDocs} PDFs,{' '}
                    {stats.totalPages} pages,{' '}
                    {(stats.indexSize / 1024).toFixed(2)} KB
                </small>
            </div>
        ) as HTMLDivElement;
    }

    /**
     * Update the stats display.
     */
    public update(): void {
        const stats = this.searchEngine.getStats();
        this.container.innerHTML = `
            <small>
                <strong>Stats:</strong> ${stats.totalDocs} PDFs, 
                ${stats.totalPages} pages, 
                ${(stats.indexSize / 1024).toFixed(2)} KB, 
                Query: ${stats.lastQueryTime.toFixed(2)}ms
            </small>
        `;
    }

    public getElement(): HTMLDivElement {
        return this.container;
    }
}
