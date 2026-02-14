// Crawl controls component
import { crawlCourse, getCurrentPageUrl } from '../crawler';
import type { PDFIndexer } from '../indexing';
import type { CourseTag } from '../types';

/**
 * Crawl controls component for managing course crawling.
 */
export class CrawlControls {
    private container: HTMLDivElement;
    private crawlButton: HTMLButtonElement;
    private crawlProgress: HTMLDivElement;
    private indexer: PDFIndexer;
    private onComplete: () => void;

    public constructor(indexer: PDFIndexer, onComplete: () => void) {
        this.indexer = indexer;
        this.onComplete = onComplete;

        this.container = document.createElement('div');

        this.crawlButton = (
            <button className="btn btn-success btn-sm mt-2">
                <i className="fa fa-sitemap mr-1" aria-hidden="true"></i>
                Crawl Course
            </button>
        ) as HTMLButtonElement;

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

        this.crawlButton.addEventListener('click', () => {
            void this.startCrawl();
        });

        this.container.appendChild(this.crawlButton);
        this.container.appendChild(this.crawlProgress);
    }

    /**
     * Start crawling the current course.
     */
    private async startCrawl(): Promise<void> {
        console.log('[PDF Search] Starting course crawl');
        this.indexer.setCrawling(true);

        this.crawlButton.disabled = true;
        this.crawlButton.textContent = 'Crawling...';
        this.crawlProgress.style.display = 'block';

        const startUrl = getCurrentPageUrl();

        try {
            await crawlCourse(
                startUrl,
                progress => {
                    console.log('[PDF Search] Crawl progress:', progress);
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
                },
                (url, tags: CourseTag[]) => this.indexer.indexPDF(url, tags)
            );

            console.log('[PDF Search] Crawl complete');
            alert('Course crawl complete! All PDFs have been indexed.');
            this.onComplete();
        } catch (error) {
            console.error('[PDF Search] Crawl error:', error);
            alert(`Crawl error: ${String(error)}`);
        } finally {
            this.indexer.setCrawling(false);
            this.crawlButton.disabled = false;
            this.crawlButton.textContent = 'Crawl Course';
            this.crawlProgress.style.display = 'none';
        }
    }

    public getElement(): HTMLDivElement {
        return this.container;
    }
}
