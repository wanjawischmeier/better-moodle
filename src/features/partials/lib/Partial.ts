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
    // Escape all regex metacharacters except `*` (which we handle next).
    const escaped = withUrl.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    // Replace `*` with a wildcard that stops at query-string / fragment boundaries.
    const withWildcard = escaped.replace(/\*/g, '[^?#]*');
    // Anchor to the start; allow the match to end at `/`, `?`, `#`, or string end.
    return new RegExp(`^${withWildcard}(/|\\?|#|$)`);
};

/**
 * A partial represents a fragment of a page identified by a CSS selector.
 * Navigation between two URLs that both match the partial's URL list will be
 * intercepted and handled by the partial-switching logic instead of a full
 * page reload.
 */
export class Partial {
    /** CSS selector for the element that this partial controls */
    readonly selector: string;
    /** URL patterns that this partial is active for */
    readonly urls: RegExp[];

    constructor(selector: string, urls: RegExp[]) {
        this.selector = selector;
        this.urls = urls;
    }

    /**
     * Returns true if the given URL matches at least one of this partial's patterns.
     * @param url - the URL to test
     */
    matches(url: string): boolean {
        return this.urls.some(pattern => pattern.test(url));
    }
}
