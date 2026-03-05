/** One cached iframe entry keyed by normalised URL. */
export interface CachedIframe {
    iframe: HTMLIFrameElement;
    /** The isolated partial element inside the iframe's document. */
    partialEl: HTMLElement;
}

/** Per-selector cache entry — one per CSS selector (e.g. `"#page"`). */
export interface PartialCache {
    /** The persistent wrapper div that lives in the host DOM for this selector. */
    wrapper: HTMLDivElement;
    /** Already-isolated iframes keyed by normalised URL. */
    iframes: Map<string, CachedIframe>;
    /** Active ResizeObserver — disconnected before handing off to a new iframe. */
    resizeObserver: ResizeObserver | null;
}

const cache = new Map<string, PartialCache>();

/**
 * Normalises a URL for use as a cache key.
 * Strips a trailing slash, preserves query string and hash.
 * @param url - the URL to normalise
 */
export const normaliseUrl = (url: string): string => {
    try {
        const u = new URL(url);
        return u.origin + u.pathname.replace(/\/$/, '') + u.search + u.hash;
    } catch {
        return url;
    }
};

/**
 * Returns an existing {@link PartialCache} for the selector, or creates one.
 * On first creation the persistent wrapper replaces `current` in the host DOM.
 * @param selector - the CSS selector identifying the partial (e.g. `"#page"`)
 * @param current  - the element currently occupying that slot in the host DOM
 */
export const getOrCreateCache = (
    selector: string,
    current: HTMLElement,
): PartialCache => {
    const hit = cache.get(selector);
    if (hit) return hit;

    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-partial-wrapper', selector);
    wrapper.id = current.id;
    wrapper.className = current.className;
    wrapper.style.cssText = 'position:relative;width:100%;';

    current.replaceWith(wrapper);

    const entry: PartialCache = {
        wrapper,
        iframes: new Map(),
        resizeObserver: null,
    };
    cache.set(selector, entry);
    return entry;
};

/**
 * Checks whether a URL is already cached for a given selector.
 * @param selector - the CSS selector
 * @param normUrl  - the already-normalised URL
 */
export const isCached = (selector: string, normUrl: string): boolean =>
    cache.get(selector)?.iframes.has(normUrl) ?? false;

/**
 * Returns the cached entry for a URL, if it exists.
 * @param selector - the CSS selector
 * @param normUrl  - the already-normalised URL
 */
export const getCached = (
    selector: string,
    normUrl: string,
): CachedIframe | undefined => cache.get(selector)?.iframes.get(normUrl);

/**
 * Stores a newly prepared iframe in the cache.
 * @param selector  - the CSS selector
 * @param normUrl   - the already-normalised URL
 * @param cached    - the iframe + partialEl to store
 */
export const storeCached = (
    selector: string,
    normUrl: string,
    cached: CachedIframe,
): void => {
    cache.get(selector)?.iframes.set(normUrl, cached);
};

/**
 * Hides every cached iframe in the wrapper except the active one.
 * Uses `visibility:hidden` + `height:0` rather than `display:none` so the
 * browser preserves the iframe's rendering context and JS heap.
 * @param entry     - the PartialCache for the selector
 * @param activeUrl - the normalised URL of the iframe to show
 */
export const activateIframe = (
    entry: PartialCache,
    activeUrl: string,
): void => {
    entry.iframes.forEach(({ iframe }, url) => {
        const active = url === activeUrl;
        iframe.style.visibility = active ? 'visible' : 'hidden';
        iframe.style.position = active ? 'static' : 'absolute';
        if (!active) iframe.style.height = '0';
    });
};

/**
 * Wires up a ResizeObserver so the iframe height always tracks the partial
 * element's `scrollHeight`. Disconnects any previous observer first.
 * @param entry     - the PartialCache for the selector
 * @param iframe    - the iframe to resize
 * @param partialEl - the element whose scrollHeight drives the iframe height
 */
export const attachHeightSync = (
    entry: PartialCache,
    iframe: HTMLIFrameElement,
    partialEl: HTMLElement,
): void => {
    entry.resizeObserver?.disconnect();
    /** Syncs the iframe height to the partial element's scrollHeight. */
    const sync = () => {
        iframe.style.height = `${partialEl.scrollHeight}px`;
    };
    sync();
    entry.resizeObserver = new ResizeObserver(sync);
    entry.resizeObserver.observe(partialEl);
};
