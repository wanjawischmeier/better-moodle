// PDF Crawler for Moodle courses
import type { CourseTag } from './types';

console.log('[PDF Crawler] Module loaded');

/**
 * Get Moodle base URL from current page.
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
    // Links that should be crawled (folders, sections, and resources)
    crawl: [
        new RegExp(`^${MOODLE_BASE_URL}/mod/folder/view\\.php`),
        new RegExp(`^${MOODLE_BASE_URL}/course/section\\.php`),
        new RegExp(`^${MOODLE_BASE_URL}/mod/resource/view\\.php`),
    ],

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
type IndexPDFCallback = (url: string, tags: CourseTag[]) => Promise<void>;

// Global concurrency control to prevent memory issues
let activeCrawls = 0;
const MAX_CONCURRENT_CRAWLS = 3; // Max total concurrent page crawls
const MAX_CRAWL_DEPTH = 2; // Maximum recursion depth

/**
 * Wait until we can start a new crawl operation.
 */
const acquireCrawlSlot = async (): Promise<void> => {
    // eslint-disable-next-line no-unmodified-loop-condition
    while (activeCrawls >= MAX_CONCURRENT_CRAWLS) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    activeCrawls++;
};

/**
 * Release a crawl slot.
 */
const releaseCrawlSlot = (): void => {
    activeCrawls--;
};

/**
 * Extract course information from current page or URL.
 *
 * @param doc - The page document
 * @param pageUrl - The URL of the page
 * @returns Array of course tags with URLs
 */
const extractCourseTags = (doc: Document, pageUrl: string): CourseTag[] => {
    const tags: CourseTag[] = [];

    // Try to get course shortname from page header
    const pageHeader = doc.querySelector('.page-header-headings h1, .page-context-header h1');
    if (pageHeader) {
        const courseName = pageHeader.textContent?.trim();
        if (courseName) {
            tags.push({ name: courseName, url: pageUrl });
            console.log(`[PDF Crawler] Extracted course tag: ${courseName}`);
            return tags;
        }
    }

    // Fallback: try breadcrumb
    const breadcrumbCourse = doc.querySelector('.breadcrumb li:nth-child(2) a, nav[aria-label="Navigation bar"] ol li:nth-child(2) a');
    if (breadcrumbCourse) {
        const courseName = breadcrumbCourse.textContent?.trim();
        const courseUrl = (breadcrumbCourse as HTMLAnchorElement).href || pageUrl;
        if (courseName) {
            tags.push({ name: courseName, url: courseUrl });
            console.log(`[PDF Crawler] Extracted course tag from breadcrumb: ${courseName}`);
            return tags;
        }
    }

    console.log('[PDF Crawler] Could not extract course tag');
    return tags;
};

/**
 * Extract all links from a DOM element.
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
 * @returns Parsed DOM document and final URL after redirects
 */
const fetchPageDOM = async (url: string): Promise<{ doc: Document; finalUrl: string }> => {
    console.log(`[PDF Crawler] Fetching page: ${url}`);
    const response = await fetch(url);
    const finalUrl = response.url;
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    console.log(`[PDF Crawler] Page fetched successfully: ${url}`);
    if (finalUrl !== url) {
        console.log(`[PDF Crawler] Redirected to: ${finalUrl}`);
    }
    return { doc, finalUrl };
};

/**
 * Crawl a single page and categorize its links.
 * @param url - The URL to crawl
 * @param visitedUrls - Set of already visited URLs
 * @param onProgress - Callback for progress updates
 * @param indexPDF - Callback to index a PDF
 * @param progress - Current crawl progress state
 * @param courseTags - Course tags to apply to all PDFs
 * @param depth - Current recursion depth
 */
const crawlPage = async (
    url: string,
    visitedUrls: Set<string>,
    onProgress: ProgressCallback,
    indexPDF: IndexPDFCallback,
    progress: CrawlProgress,
    courseTags: CourseTag[],
    depth = 0
): Promise<void> => {
    // Skip if already visited
    if (visitedUrls.has(url)) {
        console.log(`[PDF Crawler] Already visited: ${url}`);
        return;
    }

    // Check recursion depth limit
    if (depth >= MAX_CRAWL_DEPTH) {
        console.log(`[PDF Crawler] Max depth (${MAX_CRAWL_DEPTH}) reached, skipping: ${url}`);
        return;
    }

    // Mark as visited before acquiring slot to prevent race conditions
    visitedUrls.add(url);

    // Wait for an available crawl slot
    await acquireCrawlSlot();

    try {
        progress.crawledPages++;
        progress.currentUrl = url;
        onProgress({ ...progress });

        console.log(`[PDF Crawler] Crawling page ${progress.crawledPages}/${progress.totalPages}: ${url} (active: ${activeCrawls}, depth: ${depth})`);

        const { doc, finalUrl } = await fetchPageDOM(url);
        
        // Check if the page redirected to a PDF (common for resource pages)
        if (finalUrl !== url && categorizeUrl(finalUrl) === 'pdf') {
            console.log(`[PDF Crawler] Resource page redirected to PDF: ${finalUrl}`);
            progress.totalPDFs++;
            onProgress({ ...progress });
            
            try {
                console.log(`[PDF Crawler] Indexing redirected PDF: ${finalUrl} with tags:`, courseTags);
                await indexPDF(finalUrl, courseTags);
                progress.indexedPDFs++;
                onProgress({ ...progress });
            } catch (error) {
                console.error(`[PDF Crawler] Error indexing redirected PDF ${finalUrl}:`, error);
            }
            return;
        }
        
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

        // Index PDFs with limited parallelism to avoid freezing
        const PDF_PARALLEL_LIMIT = 2; // Process max 2 PDFs at once
        for (let i = 0; i < pdfLinks.length; i += PDF_PARALLEL_LIMIT) {
            const batch = pdfLinks.slice(i, i + PDF_PARALLEL_LIMIT);
            await Promise.all(
                batch.map(async pdfUrl => {
                    try {
                        console.log(`[PDF Crawler] Indexing PDF: ${pdfUrl} with tags:`, courseTags);
                        await indexPDF(pdfUrl, courseTags);
                        progress.indexedPDFs++;
                        onProgress({ ...progress });
                    } catch (error) {
                        console.error(`[PDF Crawler] Error indexing PDF ${pdfUrl}:`, error);
                    }
                })
            );
        }

        // Crawl sub-pages recursively (in parallel with limit)
        const PARALLEL_LIMIT = 3; // Limit concurrent page fetches
        for (let i = 0; i < crawlLinks.length; i += PARALLEL_LIMIT) {
            const batch = crawlLinks.slice(i, i + PARALLEL_LIMIT);
            await Promise.all(
                batch.map(link =>
                    crawlPage(link, visitedUrls, onProgress, indexPDF, progress, courseTags, depth + 1)
                )
            );
        }
    } catch (error) {
        console.error(`[PDF Crawler] Error crawling page ${url}:`, error);
    } finally {
        // Always release the crawl slot
        releaseCrawlSlot();
    }
};

/**
 * Start crawling from the current page.
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

    // Reset the global crawl counter
    activeCrawls = 0;

    // Extract course tags from the starting page (where Crawl Course was clicked)
    const { doc: startDoc } = await fetchPageDOM(startUrl);
    const courseTags = extractCourseTags(startDoc, startUrl);
    console.log('[PDF Crawler] Course tags for entire crawl:', courseTags);

    const visitedUrls = new Set<string>();
    const progress: CrawlProgress = {
        totalPages: 1,
        crawledPages: 0,
        totalPDFs: 0,
        indexedPDFs: 0,
        currentUrl: startUrl,
    };

    onProgress(progress);

    await crawlPage(startUrl, visitedUrls, onProgress, indexPDF, progress, courseTags);

    console.log('[PDF Crawler] Crawl complete:', progress);
};

/**
 * Check if we're on a Moodle course page.

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
