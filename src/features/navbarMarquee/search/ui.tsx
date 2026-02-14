// UI components for PDF search
import { isCourseViewPage } from './crawler';
import type { SearchEngine } from './search';
import type { PDFIndexer } from './indexing';
import { SearchInput } from './components/SearchInput';
import { ResultsList } from './components/ResultsList';
import { CourseFilter } from './components/CourseFilter';
import { CrawlControls } from './components/CrawlControls';
import { StatsDisplay } from './components/StatsDisplay';

/**
 * UI class for PDF search interface.
 */
export class SearchUI {
    private container: HTMLDivElement | undefined;
    private panel: HTMLDivElement | undefined;
    private searchInput: SearchInput | undefined;
    private resultsList: ResultsList | undefined;
    private courseFilter: CourseFilter | undefined;
    private crawlControls: CrawlControls | undefined;
    private statsDisplay: StatsDisplay | undefined;
    private deleteButton: HTMLButtonElement | undefined;
    
    private currentQuery = '';
    private activeTags = new Set<string>();

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
     * Perform search and render results.
     * @param query - Search query
     */
    private performSearch(query: string): void {
        this.currentQuery = query;
        const results = this.searchEngine.search(query);
        
        if (this.resultsList) {
            this.resultsList.setQuery(query);
            this.resultsList.render(results, this.activeTags.size > 0);
        }
        
        if (this.statsDisplay) {
            this.statsDisplay.update();
        }
    }

    /**
     * Handle search in all courses action.
     */
    private searchAllCourses(): void {
        const allTags = this.searchEngine.getAllTags();
        this.activeTags = new Set(allTags.map(t => t.name));
        this.searchEngine.setActiveTags(this.activeTags);
        
        if (this.courseFilter) {
            this.courseFilter.update();
        }
        
        this.performSearch(this.currentQuery);
    }

    /**
     * Create all UI elements.
     */
    public createElements(): void {
        console.log('[PDF Search] Creating UI elements');

        // Create components
        this.resultsList = new ResultsList(this.indexer, () => this.searchAllCourses());
        this.courseFilter = new CourseFilter(this.searchEngine, this.activeTags, () => this.performSearch(this.currentQuery));
        this.statsDisplay = new StatsDisplay(this.searchEngine);
        this.searchInput = new SearchInput(
            this.searchEngine, 
            this.indexer,
            (query: string) => this.performSearch(query),
            () => this.togglePanel(true)
        );

        // Create delete button
        this.deleteButton = (
            <button className="btn btn-danger btn-sm">
                <i className="fa fa-trash mr-1" aria-hidden="true"></i>
                Clear Index
            </button>
        ) as HTMLButtonElement;

        this.deleteButton.addEventListener('click', () => {
            if (confirm('Are you sure you want to delete the entire search index? This cannot be undone.')) {
                this.indexer.clearIndex();
                this.activeTags.clear();
                this.searchEngine.setActiveTags(this.activeTags);
                this.performSearch('');
                if (this.statsDisplay) {
                    this.statsDisplay.update();
                }
                if (this.courseFilter) {
                    this.courseFilter.update();
                }
                alert('Search index cleared successfully.');
            }
        });

        // Create crawl controls if on a course page
        const showCrawlButton = isCourseViewPage();
        console.log('[PDF Search] Show crawl button:', showCrawlButton);

        if (showCrawlButton) {
            this.crawlControls = new CrawlControls(this.indexer, () => {
                if (this.courseFilter) {
                    this.courseFilter.update();
                }
            });
        }

        // Create search panel
        this.panel = (
            <div
                className="card position-absolute"
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
                    {this.resultsList.getElement()}
                    {this.courseFilter.getElement()}
                    {showCrawlButton && (
                        <div className="border-top pt-2 mt-2">
                            <div className="d-flex gap-2">
                                {this.crawlControls!.getElement()}
                                {this.deleteButton}
                            </div>
                        </div>
                    )}
                    {!showCrawlButton && (
                        <div className="border-top pt-2 mt-2">
                            {this.deleteButton}
                        </div>
                    )}
                    {this.statsDisplay.getElement()}
                </div>
            </div>
        ) as HTMLDivElement;

        // Create main container
        this.container = (
            <div className="nav-item d-flex align-items-center ml-2 position-relative">
                <i
                    className="fa fa-search mr-2"
                    aria-hidden="true"
                    style={{ fontSize: '1.2em' }}
                ></i>
                {this.searchInput.getElement()}
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
     * Initialize filter UI after loading.
     */
    public initializeFilters(): void {
        console.log('[PDF Search] initializeFilters called');
        if (this.courseFilter) {
            this.courseFilter.update();
        }
    }

    /**
     * Update the stats display.
     */
    public updateStatsDisplay(): void {
        if (this.statsDisplay) {
            this.statsDisplay.update();
        }
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
