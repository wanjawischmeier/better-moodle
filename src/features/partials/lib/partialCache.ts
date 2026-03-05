import { PartialFragment } from './Partial';

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
    /** Already-isolated iframes keyed by normalised URL (insertion order = age). */
    iframes: Map<string, CachedIframe>;
    /** Active ResizeObserver — disconnected before handing off to a new iframe. */
    resizeObserver: ResizeObserver | null;
    /** Maximum number of iframes to retain. */
    cacheSize: number;
    /** Predicate for URLs that must never be evicted. */
    isPinned: (url: string) => boolean;
}

const cache = new Map<string, PartialCache>();

/**
 * Normalises a URL for use as a cache key.
 * Strips a trailing slash, preserves query string and hash.
 * @param url - the URL to normalise
 * @returns the normalised URL string
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
 * @param partial - the partial definition (carries selector, cacheSize, pinUrls)
 * @param current - the element currently occupying that slot in the host DOM
 * @returns the existing or newly created {@link PartialCache}
 */
export const getOrCreateCache = (
    partial: PartialFragment,
    current: HTMLElement,
): PartialCache => {
    const hit = cache.get(partial.selector);
    if (hit) return hit;

    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-partial-wrapper', partial.selector);
    wrapper.id = current.id;
    wrapper.className = current.className;
    wrapper.style.cssText = 'position:relative;width:100%;';

    current.replaceWith(wrapper);

    const entry: PartialCache = {
        wrapper,
        iframes: new Map(),
        resizeObserver: null,
        cacheSize: partial.cacheSize,
        /** Returns true if the given URL matches a pin pattern. */
        isPinned: (url: string) => partial.isPinned(url),
    };
    cache.set(partial.selector, entry);
    return entry;
};

/**
 * Checks whether a URL is already cached for a given selector.
 * @param selector - the CSS selector
 * @param normUrl  - the already-normalised URL
 * @returns true if a cached iframe exists for this selector + URL combination
 */
export const isCached = (selector: string, normUrl: string): boolean =>
    cache.get(selector)?.iframes.has(normUrl) ?? false;

/**
 * Returns the cached entry for a URL, if it exists.
 * @param selector - the CSS selector
 * @param normUrl  - the already-normalised URL
 * @returns the {@link CachedIframe} or `undefined` if not cached
 */
export const getCached = (
    selector: string,
    normUrl: string,
): CachedIframe | undefined => cache.get(selector)?.iframes.get(normUrl);

/**
 * Stores a newly prepared iframe in the cache, evicting the oldest non-pinned
 * entry if the cache size limit for this selector has been reached.
 * @param selector  - the CSS selector
 * @param normUrl   - the already-normalised URL
 * @param cached    - the iframe + partialEl to store
 */
export const storeCached = (
    selector: string,
    normUrl: string,
    cached: CachedIframe,
): void => {
    const entry = cache.get(selector);
    if (!entry) return;

    // Evict oldest non-pinned entry if at the limit.
    if (entry.iframes.size >= entry.cacheSize) {
        for (const [url, { iframe }] of entry.iframes) {
            if (!entry.isPinned(url)) {
                iframe.remove();
                entry.iframes.delete(url);
                console.log(`[better-moodle/partials] Cache evicted: ${url}`);
                break;
            }
        }
        // If every entry is pinned and we're still at the limit, evict the
        // oldest pinned entry rather than refusing to store the new one.
        if (entry.iframes.size >= entry.cacheSize) {
            const [oldestUrl, { iframe }] = entry.iframes.entries().next().value!;
            iframe.remove();
            entry.iframes.delete(oldestUrl);
            console.log(`[better-moodle/partials] Cache evicted (all pinned, forced): ${oldestUrl}`);
        }
    }

    entry.iframes.set(normUrl, cached);
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
