import { PartialFragment } from './Partial';
import { applyPartial } from './partialHandler';

/** Border longhand properties that drive the active-tab underline. */
const BORDER_PROPS = [
    'border-bottom-color',
    'border-bottom-style',
    'border-bottom-width',
    'box-shadow',
] as const;

/**
 * Active border styles captured once from the server-rendered active nav link.
 * Stored at module level so they survive across multiple partial swaps
 */
let capturedActiveBorderStyles: Partial<Record<string, string>> | null = null;

/** Captures border styles from the currently active nav link if not yet stored. */
const ensureBorderStylesCaptured = (): void => {
    if (capturedActiveBorderStyles) return;
    const active = document.querySelector<HTMLAnchorElement>(
        'nav li > a.active:not(:has(img)), [role="menu"] li > a.active:not(:has(img)), [role="menubar"] li > a.active:not(:has(img)), [role="navigation"] li > a.active:not(:has(img))'
    );
    if (!active) return;
    const cs = getComputedStyle(active);
    capturedActiveBorderStyles = {};
    for (const prop of BORDER_PROPS) {
        capturedActiveBorderStyles[prop] = cs.getPropertyValue(prop);
    }
};

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
    partials.find(p => p.matchesBoth(currentUrl, targetUrl));

/**
 * Builds the click handler for the given set of partials.
 * Intercepts same-context link clicks and delegates to partial-switching when
 * a matching partial exists; all other clicks are left to the browser.
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
        ) {
            return;
        }

        if (!(event.target instanceof Element)) return;

        const link = event.target.closest<HTMLAnchorElement>('a[href]');
        if (!link) return;

        // Respect explicit `target` attributes that would open a different context.
        if (link.target && link.target !== '_self') return;

        const href = link.href;
        if (!href || href.startsWith('javascript:') || href === '#') return;

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

        const partial = findMatchingPartial(partials, topLocation.href, href);
        if (!partial) {
            console.log(
                '[better-moodle/partials] Link click not intercepted (no matching partial):',
                href
            );
            return;
        }

        event.preventDefault();

        // Update URL and nav state immediately on click, before the swap loads.
        window.top!.history.pushState(null, '', href);
        updateNavActiveState(href);
        void applyPartial(partial, href, false);
    };

/**
 * Updates the active state of navbar links in the host page to reflect the
 * new URL after a partial swap.  Moodle sets `active` class and
 * `aria-current` server-side, so they never update automatically when we
 * intercept navigation.
 *
 * Border styles are captured once from the original server-rendered active
 * element and reused on every subsequent activation, avoiding any corruption
 * from inline style mutations across swaps.
 * @param targetUrl - the URL that was just navigated to
 */
const updateNavActiveState = (targetUrl: string): void => {
    ensureBorderStylesCaptured();
    const target = new URL(targetUrl);

    const navLinks = Array.from(
        document.querySelectorAll<HTMLAnchorElement>(
            'nav li > a[href], [role="menu"] li > a[href], [role="menubar"] li > a[href], [role="navigation"] li > a[href]'
        )
    );

    for (const a of navLinks) {
        // Skip logo/brand links — they contain images rather than text labels.
        if (a.querySelector('img')) continue;

        let aUrl: URL;
        try {
            aUrl = new URL(a.href);
        } catch {
            continue;
        }

        if (aUrl.href === target.href) {
            a.classList.add('active');
            a.setAttribute('aria-current', 'true');
            // Restore the captured active border styles on the new active element.
            if (capturedActiveBorderStyles) {
                for (const prop of BORDER_PROPS) {
                    const value = capturedActiveBorderStyles[prop];
                    if (value) a.style.setProperty(prop, value);
                }
            }
        } else if (a.classList.contains('active')) {
            a.classList.remove('active');
            a.removeAttribute('aria-current');
            a.style.setProperty('border-bottom-color', 'transparent');
        }
    }
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
