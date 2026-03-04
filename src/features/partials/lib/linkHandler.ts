import { Partial } from './Partial';
import { applyPartial } from './partialHandler';

/**
 * Returns the first partial that matches both the current and the target URL,
 * or `undefined` if no partial applies.
 * @param partials   - the list of registered partials
 * @param currentUrl - the URL of the page the user is currently on
 * @param targetUrl  - the URL the user is trying to navigate to
 */
const findMatchingPartial = (
    partials: Partial[],
    currentUrl: string,
    targetUrl: string
): Partial | undefined =>
    partials.find(p => p.matches(currentUrl) && p.matches(targetUrl));

/**
 * Builds the click handler for the given set of partials.
 * Intercepts same-context link clicks and delegates to partial-switching when
 * a matching partial exists; all other clicks are left to the browser.
 *
 * NOTE: This is intentionally split from the hover-based prefetch logic
 * (to be added later) so that both can be attached/detached independently.
 * @param partials - the list of registered partials to match against
 */
const buildClickHandler =
    (partials: Partial[]) =>
    (event: MouseEvent): void => {
        // Let the browser handle new-tab intents (Ctrl / Meta / middle-click).
        if (
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            event.button !== 0
        )
            return;

        if (!(event.target instanceof Element)) return;

        const link = event.target.closest<HTMLAnchorElement>('a[href]');
        if (!link) return;

        // Respect explicit `target` attributes that would open a different context.
        if (link.target && link.target !== '_self') return;

        const href = link.href;
        if (!href || href.startsWith('javascript:')) return;

        // Skip in-page anchor navigation (same origin, path and search — only hash differs).
        const targetParsed = new URL(href);
        if (
            targetParsed.origin === window.location.origin &&
            targetParsed.pathname === window.location.pathname &&
            targetParsed.search === window.location.search
        )
            return;

        const partial = findMatchingPartial(partials, window.location.href, href);
        if (!partial) {
            console.log(
                '[better-moodle/partials] Link click not intercepted (no matching partial):',
                href
            );
            return;
        }

        event.preventDefault();
        void applyPartial(partial, href);
    };

let clickHandler: ((event: MouseEvent) => void) | null = null;

/**
 * Attaches the click interception listener for the given partials.
 * @param partials - the list of registered partials
 */
export const attach = (partials: Partial[]): void => {
    if (clickHandler) return;
    clickHandler = buildClickHandler(partials);
    document.addEventListener('click', clickHandler);
};

/**
 * Removes the click interception listener.
 */
export const detach = (): void => {
    if (!clickHandler) return;
    document.removeEventListener('click', clickHandler);
    clickHandler = null;
    console.log(
        '[better-moodle/partials] Click interception removed (feature unloaded).'
    );
};
