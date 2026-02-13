// PDF Crawler for Moodle courses
console.log('[PDF Crawler] Module loaded');

/**
 * Get Moodle base URL from current page.
 *
 * @returns The base URL of the current Moodle instance
 */
const getMoodleBaseUrl = (): string => {
    const { protocol, hostname, port } = window.location;
    const portStr = port ? `:${port}` : '';
    return `${protocol}//${hostname}${portStr}`;
};

const MOODLE_BASE_URL = getMoodleBaseUrl();

// Regex patterns for link categorization
const PATTERNS = {
    // Links that should be crawled (folders)
    crawl: [new RegExp(`^${MOODLE_BASE_URL}/mod/folder/view\\.php`)],

    // Links that point to PDFs
    pdf: [
        /\.pdf($|\?|#)/i, // PDF files (with possible query params or anchors)
        /\/pluginfile\.php\/.*\/(application\/pdf|document)/i, // Moodle pluginfile PDFs
    ],
};

console.log('[PDF Crawler] Patterns configured for base URL:', MOODLE_BASE_URL);

interface CrawlProgress {
    totalPages: number;
    crawledPages: number;
    totalPDFs: number;
    indexedPDFs: number;
    currentUrl: string;
}

type ProgressCallback = (progress: CrawlProgress) => void;
type IndexPDFCallback = (url: string) => Promise<void>;

/**
 * Extract all links from a DOM element.
 *
 * @param element - The DOM element to extract links from
 * @returns Array of absolute URLs found in the element
 */
const extractLinks = (element: Document | Element): string[] => {
    console.log('[PDF Crawler] Extracting links from element');
    const links: string[] = [];
    const anchors = element.querySelectorAll('a[href]');

    for (const anchor of anchors) {
        const href = (anchor as HTMLAnchorElement).href;
        if (href?.startsWith('http')) {
            links.push(href);
        }
    }

    console.log(`[PDF Crawler] Found ${links.length} links`);
    return links;
};

/**
 * Categorize a URL based on patterns.
 *
 * @param url - The URL to categorize
 * @returns Category type: 'crawl', 'pdf', or 'ignore'
 */
const categorizeUrl = (url: string): 'crawl' | 'pdf' | 'ignore' => {
    // Check crawl patterns
    for (const pattern of PATTERNS.crawl) {
        if (pattern.test(url)) {
            return 'crawl';
        }
    }

    // Check PDF patterns
    for (const pattern of PATTERNS.pdf) {
        if (pattern.test(url)) {
            return 'pdf';
        }
    }

    return 'ignore';
};

/**
 * Fetch HTML content from a URL.
 *
 * @param url - The URL to fetch
 * @returns Parsed DOM document
 */
const fetchPageDOM = async (url: string): Promise<Document> => {
    console.log(`[PDF Crawler] Fetching page: ${url}`);
    const response = await fetch(url);
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    console.log(`[PDF Crawler] Page fetched successfully: ${url}`);
    return doc;
};

/**
 * Crawl a single page and categorize its links.
 *
 * @param url - The URL to crawl
 * @param visitedUrls - Set of already visited URLs
 * @param onProgress - Callback for progress updates
 * @param indexPDF - Callback to index a PDF
 * @param progress - Current crawl progress state
 */
const crawlPage = async (
    url: string,
    visitedUrls: Set<string>,
    onProgress: ProgressCallback,
    indexPDF: IndexPDFCallback,
    progress: CrawlProgress
): Promise<void> => {
    // Skip if already visited
    if (visitedUrls.has(url)) {
        console.log(`[PDF Crawler] Already visited: ${url}`);
        return;
    }

    visitedUrls.add(url);
    progress.crawledPages++;
    progress.currentUrl = url;
    onProgress({ ...progress });

    console.log(`[PDF Crawler] Crawling page ${progress.crawledPages}/${progress.totalPages}: ${url}`);

    try {
        const doc = await fetchPageDOM(url);
        const links = extractLinks(doc);

        const crawlLinks: string[] = [];
        const pdfLinks: string[] = [];

        // Categorize all links
        for (const link of links) {
            const category = categorizeUrl(link);
            if (category === 'crawl' && !visitedUrls.has(link)) {
                crawlLinks.push(link);
            } else if (category === 'pdf') {
                pdfLinks.push(link);
            }
        }

        console.log(`[PDF Crawler] Found ${crawlLinks.length} pages to crawl, ${pdfLinks.length} PDFs`);

        // Update totals
        progress.totalPages += crawlLinks.length;
        progress.totalPDFs += pdfLinks.length;
        onProgress({ ...progress });

        // Index PDFs in parallel
        const pdfPromises = pdfLinks.map(async pdfUrl => {
            try {
                console.log(`[PDF Crawler] Indexing PDF: ${pdfUrl}`);
                await indexPDF(pdfUrl);
                progress.indexedPDFs++;
                onProgress({ ...progress });
            } catch (error) {
                console.error(`[PDF Crawler] Error indexing PDF ${pdfUrl}:`, error);
            }
        });

        await Promise.all(pdfPromises);

        // Crawl sub-pages recursively (in parallel with limit)
        const PARALLEL_LIMIT = 3; // Limit concurrent page fetches
        for (let i = 0; i < crawlLinks.length; i += PARALLEL_LIMIT) {
            const batch = crawlLinks.slice(i, i + PARALLEL_LIMIT);
            await Promise.all(
                batch.map(link =>
                    crawlPage(link, visitedUrls, onProgress, indexPDF, progress)
                )
            );
        }
    } catch (error) {
        console.error(`[PDF Crawler] Error crawling page ${url}:`, error);
    }
};

/**
 * Start crawling from the current page.
 *
 * @param startUrl - The URL to start crawling from
 * @param onProgress - Callback for progress updates
 * @param indexPDF - Callback to index a PDF
 */
export const crawlCourse = async (
    startUrl: string,
    onProgress: ProgressCallback,
    indexPDF: IndexPDFCallback
): Promise<void> => {
    console.log('[PDF Crawler] Starting course crawl from:', startUrl);

    const visitedUrls = new Set<string>();
    const progress: CrawlProgress = {
        totalPages: 1,
        crawledPages: 0,
        totalPDFs: 0,
        indexedPDFs: 0,
        currentUrl: startUrl,
    };

    onProgress(progress);

    await crawlPage(startUrl, visitedUrls, onProgress, indexPDF, progress);

    console.log('[PDF Crawler] Crawl complete:', progress);
};

/**
 * Check if we're on a Moodle course page.
 *
 * @returns True if on a course view page
 */
export const isCourseViewPage = (): boolean => {
    const isCoursePage = window.location.href.startsWith(
        `${MOODLE_BASE_URL}/course/view.php`
    );
    console.log('[PDF Crawler] Is course page:', isCoursePage);
    return isCoursePage;
};

/**
 * Get the current page URL.
 *
 * @returns The current page URL
 */
export const getCurrentPageUrl = (): string => {
    return window.location.href;
};
