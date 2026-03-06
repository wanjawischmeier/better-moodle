/**
 * Converts a glob-style URL pattern string to a RegExp.
 * Use `MOODLE_URL` as a placeholder for the configured Moodle base URL.
 * A single `*` matches any sequence of characters except `?` and `#`.
 * @param pattern - The pattern string to convert, e.g. `MOODLE_URL/my/*`
 * @returns a RegExp that matches URLs fitting the pattern
 */
export const patternToRegex = (pattern: string): RegExp => {
    // Substitute the placeholder before escaping, so the URL's own special
    // regex chars (dots, etc.) get escaped as part of the literal portion.
    const withUrl = pattern.replace('MOODLE_URL', __MOODLE_URL__);
    // Strip a trailing slash from the pattern's path so that
    // `MOODLE_URL/my/` and `MOODLE_URL/my` are treated as identical.
    const normalised = withUrl.replace(/\/(\?|#|$)/, '$1').replace(/\/$/, '');
    // Escape all regex metacharacters except `*` (which we handle next).
    const escaped = normalised.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    // Replace `*` with a wildcard that stops at query-string / fragment boundaries.
    const withWildcard = escaped.replace(/\*/g, '[^?#]*');
    // Anchor to the start; allow an optional trailing slash then end/query/hash.
    return new RegExp(`^${withWildcard}/?(?:\\?|#|$)`);
};

/** Strips a trailing slash from the path portion of a URL. */
const stripTrailingSlash = (url: string): string => {
    try {
        const u = new URL(url);
        u.pathname = u.pathname.replace(/\/$/, '') || '/';
        return u.href;
    } catch {
        return url.replace(/\/(?=\?|#|$)/, '');
    }
};


/**
 * A CSS selector paired with the style properties to forcibly apply to any
 * matching element in the top-level page when this partial is applied.
 */
export interface StylePatch {
    /** CSS selector for the element(s) to patch. */
    selector: string;
    /** Property/value pairs to set as inline styles. */
    styles: Partial<Record<string, string>>;
}

/**
 * Options controlling caching behaviour for a {@link PartialFragment}.
 */
export interface PartialCacheOptions {
    /**
     * Maximum number of iframes to keep in the cache for this partial.
     * When the limit is reached the oldest non-pinned entry is evicted.
     * @default 5
     */
    cacheSize?: number;
    /**
     * URL patterns whose iframes are never evicted from the cache (they still
     * count towards `cacheSize`).  Use the same `MOODLE_URL/*` syntax as the
     * navigation URL list.
     */
    pinUrls?: RegExp[];
    /**
     * Optional extra predicate evaluated after URL-pattern matching.
     * Both `currentUrl` and `targetUrl` match the URL list when this is called.
     * Return `false` to refuse the partial swap and fall through to the next
     * partial (or a full navigation).
     * @param currentUrl - the URL the user is navigating from
     * @param targetUrl  - the URL the user is navigating to
     */
    condition?: (currentUrl: string, targetUrl: string) => boolean;
    /**
     * Style patches to apply to elements in the top-level document whenever
     * this partial is applied.  Use this to neutralise unwanted layout styles
     * (e.g. padding / margin) on ancestor elements that would otherwise affect
     * the partial's container.
     */
    stylePatches?: StylePatch[];
    
    readonly preferTopDocMatch?: boolean;
}

/**
 * A partial represents a fragment of a page identified by a CSS selector.
 * Navigation between two URLs that both match the partial's URL list will be
 * intercepted and handled by the partial-switching logic instead of a full
 * page reload.
 */
export class PartialFragment {
    /** CSS selector for the element that this partial controls */
    readonly selector: string;
    /** URL patterns that this partial is active for */
    readonly urls: RegExp[];
    /** Maximum number of iframes kept in the cache for this partial. */
    readonly cacheSize: number;
    /** URL patterns whose cached iframes are never evicted. */
    readonly pinUrls: RegExp[];
    /** Optional extra predicate applied on top of URL-pattern matching. */
    readonly condition: ((currentUrl: string, targetUrl: string) => boolean) | null;
    /** Style patches applied to the top-level document on every partial swap. */
    readonly stylePatches: StylePatch[];
    readonly preferTopDocMatch: boolean;

    constructor(selector: string, urls: RegExp[], options: PartialCacheOptions = {}) {
        this.selector = selector;
        this.urls = urls;
        this.cacheSize = options.cacheSize ?? 5;
        this.pinUrls = options.pinUrls ?? [];
        this.condition = options.condition ?? null;
        this.stylePatches = options.stylePatches ?? [];
        this.preferTopDocMatch = options.preferTopDocMatch ?? false;
    }

    /**
     * Returns true if the given URL matches at least one of this partial's patterns.
     * @param url - the URL to test
     */
    matches(url: string): boolean {
        return this.urls.some(pattern => pattern.test(stripTrailingSlash(url)));
    }

    /**
     * Returns true if both URLs match the pattern list and the optional condition.
     * @param currentUrl - the URL the user is navigating from
     * @param targetUrl  - the URL the user is navigating to
     */
    matchesBoth(currentUrl: string, targetUrl: string): boolean {
        return (
            this.matches(currentUrl) &&
            this.matches(targetUrl) &&
            (this.condition === null || this.condition(currentUrl, targetUrl))
        );
    }

    /**
     * Returns true if the given URL should be pinned in the cache.
     * @param url - the URL to test
     */
    isPinned(url: string): boolean {
        return this.pinUrls.some(pattern => pattern.test(stripTrailingSlash(url)));
    }
}


export class PartialElement {
    readonly doc: Document;
    readonly iframe: HTMLIFrameElement;
    readonly innerElement: HTMLElement;

    constructor(partialDoc: Document, iframe: HTMLIFrameElement, innerElement: HTMLElement) {
        this.doc = partialDoc;
        this.iframe = iframe;
        this.innerElement = innerElement;
    }
}