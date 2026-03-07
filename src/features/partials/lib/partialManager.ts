import { clearInFlight } from "./inFlight";
import { PartialFragment } from "./Partial";
import { findElementMatchingPartial, restoreMatchingOuterPartial, swapPartials } from "./partialHandler";

const LOG = '[better-moodle/partials/partialManager]';


function applyStylePatches(topDoc: Document, childDoc: Document, partial: PartialFragment) {
    if (!partial.spec.stylePatches) return;

    // TODO: apply from child doc up recursively
    for (const { selector, styles } of partial.spec.stylePatches) {
        const targets = [
            ...topDoc.querySelectorAll<HTMLElement>(selector),
            ...childDoc.querySelectorAll<HTMLElement>(selector)
        ];

        for (const el of targets) {
            for (const [prop, value] of Object.entries(styles)) {
                if (value === undefined) continue;

                // Store old value and keep new value
                el.dataset[prop] = el.style.getPropertyValue(prop);
                el.style.setProperty(prop, value);
            }
        }
    }

    console.log(`${LOG} Partial styles patched`);
}

export function restorePrePatchStyles(partial: PartialFragment, el: HTMLElement) {
    if (!partial.spec.stylePatches) return;
    console.log('restoring styles')
    for (const { selector, styles } of partial.spec.stylePatches) {
            console.log(`trying ${selector}`)
            if (!el.matches(selector)) continue;
            console.log('match')
            for (const prop of Object.keys(styles)) {
                const style = el.dataset[prop];
                console.log(`${prop}: ${style} (${style === undefined})`)
                if (style === undefined) continue;
                console.log(`applying`)
                el.style.setProperty(prop, style);
                delete el.dataset[prop];
            }
    }
}

/**
 * Applies a partial swap, loading `targetUrl` in an iframe and isolating the
 * element matching `partial.selector`.
 *
 * Only one swap per selector can be in flight at a time. If a second call
 * arrives while the first is still loading, the first is cancelled and its
 * overlay/iframe are removed before the new one starts.
 * @param partial      - the partial that matched the navigation
 * @param targetUrl    - the URL the user is navigating to
 * @param pushHistory  - whether to push a new history entry (false when
 *                       called from a popstate handler where the URL is
 *                       already correct)
 * @param fromUrl      - the URL being navigated away from (for logging);
 *                       defaults to the current top-level URL if omitted
 */
export const applyPartial = async (
    partial: PartialFragment,
    targetUrl: string,
    pushHistory = true,
): Promise<void> => {
    if (!window.top) {
        console.error(`${LOG} Failed to apply partial: top window undefined.`);
        window.location.href = targetUrl;
        return;
    }

    const topDoc = window.top.document;
    if (restoreMatchingOuterPartial(partial, targetUrl)) {
        if (pushHistory) {
            window.top.history.pushState(null, '', targetUrl);
        }

        return;
    }

    // Find an element matching the partial selector (prefer match in iframe)
    const partialWrapper = findElementMatchingPartial(topDoc, partial);
    if (!partialWrapper) {
        console.warn(`${LOG} Selector "${partial.spec.selector}" not found - falling back.`);
        window.top.location.href = targetUrl;
        return;
    }

    const sourceUrl = partialWrapper.ownerDocument.location.href;
    console.log(
        `${LOG} Applying partial "${partial.spec.selector}":`,
        sourceUrl, '->', targetUrl,
    );

    if (pushHistory) {
        window.top.history.pushState(null, '', targetUrl);
    }

    const partialElement = await swapPartials(partialWrapper, partial, sourceUrl, targetUrl);
    if (!partialElement) {
        console.error(`${LOG} Failed to swap partials - falling back.`);
        window.top.location.href = targetUrl;
        return;
    }

    const { iframe, innerElement } = partialElement;

    applyStylePatches(topDoc, partialElement.doc, partial);

    /** Syncs the wrapper/iframe height to the partial element's scrollHeight. */
    const syncHeight = () => { iframe.style.height = `${innerElement.scrollHeight}px`; };
    syncHeight();
    new ResizeObserver(syncHeight).observe(innerElement);

    console.log('synced');
    clearInFlight(partial.spec.selector);

    console.log(`${LOG} Partial "${partial.spec.selector}" applied successfully.`);
};
