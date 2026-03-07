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

type PartialMatchingCondition = ((currentUrl: string, targetUrl: string) => boolean);

export interface PartialSpecification {
    /** CSS selector for the element that this partial controls */
    selector: string;
    /** URL patterns that this partial is active for */
    urls: RegExp[];
    /** Optional extra predicate applied on top of URL-pattern matching. */
    condition?: PartialMatchingCondition;
    /** Style patches applied to the top-level document on every partial swap. */
    stylePatches?: StylePatch[];
    preferTopDocMatch?: boolean; // TODO: Remove in favor of more robust logic
}

/**
 * A partial represents a fragment of a page identified by a CSS selector.
 * Navigation between two URLs that both match the partial's URL list will be
 * intercepted and handled by the partial-switching logic instead of a full
 * page reload.
 */
export class PartialFragment {
    readonly spec: PartialSpecification;

    constructor(spec: PartialSpecification) {
        this.spec = spec;
    }

    /**
     * Returns true if the given URL matches at least one of this partial's patterns.
     * @param url - the URL to test
     */
    matches(url: string): boolean {
        return this.spec.urls.some(pattern => pattern.test(stripTrailingSlash(url)));
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
            (this.spec.condition === undefined || this.spec.condition(currentUrl, targetUrl))
        );
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