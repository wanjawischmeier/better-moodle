import { PartialFragment } from './Partial';
import { applyPartial } from './partialHandler';

/**
 * Returns the first partial that matches both the current and the target URL,
 * or `undefined` if no partial applies.
 * @param partials   - the list of registered partials
 * @param currentUrl - the URL of the page the user is currently on
 * @param targetUrl  - the URL the user is trying to navigate to
 */
const findMatchingPartial = (
    partials: PartialFragment[],
    currentUrl: string,
    targetUrl: string
): PartialFragment | undefined =>
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
    (partials: PartialFragment[]) =>
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
        const topLocation = window.top!.location;
        if (
            targetParsed.origin === topLocation.origin &&
            targetParsed.pathname === topLocation.pathname &&
            targetParsed.search === topLocation.search
        ) {
            return;
        }

        // Do nothing if already on target page - TODO doesnt work rn
        if (targetParsed.href === topLocation.href) {
            console.log('Already on target page!');
            event.preventDefault();
            return;
        }

        const partial = findMatchingPartial(partials, topLocation.href, href);
        if (!partial) {
            console.log(
                '[better-moodle/partials] Link click not intercepted (no matching partial):',
                href
            );
            return;
        }

        event.preventDefault();
        void applyPartial(partial, href).then(() => {
            updateNavActiveState(href);
        });
    };

/**
 * Updates the active state of navbar links in the host page to reflect the
 * new URL after a partial swap.  Moodle sets `active` class and
 * `aria-current` server-side, so they never update automatically when we
 * intercept navigation.
 * @param targetUrl - the URL that was just navigated to
 */
const updateNavActiveState = (targetUrl: string): void => {
    const target = new URL(targetUrl);

    document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(a => {
        // Only touch links that look like nav/menu items.
        if (!a.closest('nav, [role="menu"], [role="menubar"], [role="navigation"]')) return;

        let aUrl: URL;
        try {
            aUrl = new URL(a.href);
        } catch {
            return;
        }

        const isMatch =
            aUrl.origin === target.origin &&
            aUrl.pathname === target.pathname &&
            aUrl.search === target.search;

        a.classList.toggle('active', isMatch);
        if (isMatch) {
            a.setAttribute('aria-current', 'true');
        } else {
            a.removeAttribute('aria-current');
        }
    });
};

let clickHandler: ((event: MouseEvent) => void) | null = null;

/**
 * Attaches the click interception listener for the given partials.
 * @param partials - the list of registered partials
 */
export const attach = (partials: PartialFragment[]): void => {
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
