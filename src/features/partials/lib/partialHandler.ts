import { createAndLoadIframe, isolateIframe, waitForIframeStable } from "./iframeHandler";
import { clearInFlight, registerInFlight } from "./inFlight";
import { addLoadingOverlay, fadeOutOverlay } from "./loadingOverlay";
import { PartialElement, PartialFragment } from "./Partial";

const LOG = '[better-moodle/partials/partialHandler]';

// ---------------------------------------------------------------------------
// Ancestor-partial detection (fix for nested iframes with duplicate src)
// ---------------------------------------------------------------------------

/**
 * Walks the iframe ancestor chain to find the **outermost** ancestor window
 * whose URL already equals `targetUrl`.  When found, the wrapper element of
 * that ancestor's `<iframe>` has its hidden original children restored and the
 * `<iframe>` itself is removed — which cascades and destroys all inner iframes,
 * including the current one.
 *
 * This prevents the browser from blocking a nested iframe that would otherwise
 * have the same `src` as one of its ancestors.
 *
 * Pairs iterated (childWin → parentWin):
 *   (window,              window.parent)
 *   (window.parent,       window.parent.parent)
 *   …
 * The outermost (last) matching pair is used so the minimal subtree is torn
 * down.
 * @param targetUrl - the URL being navigated to
 * @returns `true` if an ancestor match was found and handled
 */
export function restoreMatchingOuterPartial(targetUrl: string): boolean {
    if (window === window.top) return false;

    let targetHref: string;
    try {
        targetHref = new URL(targetUrl, window.location.href).href;
    } catch {
        return false;
    }

    let outermost: { iframeEl: HTMLIFrameElement; wrapper: HTMLElement } | null = null;

    // Walk from the current window up to (but not including) window.top.
    // childWin is the window whose src we test; parentWin owns the <iframe> element.
    let childWin: Window = window;
    let parentWin: Window = window.parent;

    while (childWin !== window.top) {
        try {
            const childHref = new URL(childWin.location.href).href;
            if (childHref !== targetHref) {
                childWin = parentWin;
                parentWin = parentWin.parent;
                continue;
            }
        } catch {
            // Cross-origin ancestor — stop walking.
            break;
        }

        const capturedChild = childWin;
        const iframeEl = Array.from(
            parentWin.document.querySelectorAll<HTMLIFrameElement>('iframe'),
        ).find(el => el.contentWindow === capturedChild);

        if (iframeEl?.parentElement instanceof HTMLElement) {
            // Keep updating so we end up with the outermost (last) match.
            outermost = { iframeEl, wrapper: iframeEl.parentElement };
        }

        childWin = parentWin;
        parentWin = parentWin.parent;
    }

    if (!outermost) return false;

    const { iframeEl, wrapper } = outermost;

    // Un-hide the original children that were preserved by fix (a).
    Array.from(wrapper.children).forEach(child => {
        if (child !== iframeEl && child instanceof HTMLElement) {
            child.style.display = '';
        }
    });

    // Removing the outermost matching iframe destroys all nested iframes too.
    // TODO: do this after delay?
    iframeEl.remove();

    console.log(`${LOG} Ancestor partial at "${targetHref}" restored; iframe subtree removed.`);
    return true;
};


/**
 * Iframe swap (based on targetUrl)
 * 
 * 1. Based on target url: find a partial matching that url (prefer match in iframe)
 * 2. Check if anywhere up the tree there is already a partial with matching data-url
 *   - If so, delete any iframe children of that and reenable all other elements
 * 3. If not, initialize a swap.
 */


export function findElementMatchingPartial(doc: Document, partial: PartialFragment): HTMLElement | null {
    // Check top document first
    let match: HTMLElement | null = doc.querySelector<HTMLElement>(partial.selector);
    if (match && partial.preferTopDocMatch) return match;

    // Recursively search all same-origin iframes
    const iframes = Array.from(doc.querySelectorAll('iframe'));
    for (const iframe of iframes) {
        try {
            if (iframe.contentDocument) {
                const iframeMatch = findElementMatchingPartial(iframe.contentDocument, partial);
                if (iframeMatch && iframeMatch.dataset.isInnerPartialElement !== 'true') {
                    match = iframeMatch;
                    break; // Stop at first match (like original)
                }
            }
        } catch {
            // Cross-origin iframe - skip
        }
    }

    return match;
}


export async function swapPartials(partialWrapper: HTMLElement, targetPartial: PartialFragment, targetUrl: string): Promise<PartialElement | undefined> {
    const currentHeight = partialWrapper.scrollHeight;

    // --- Layer new content directly inside the existing element ---
    // We mutate `current` in-place so there is never a duplicate #id in the DOM.
    // Child stacking order (top → bottom):
    //   spinnerWrapper  position:absolute  z-index:2
    //   barrier         position:absolute  z-index:1
    //   new iframe      position:absolute  z-index:0
    //   old children    normal flow        (behind all positioned children)

    // Snapshot and hide existing children so we can remove them once the swap is done.
    // Don't remove immediately to keep possible scripts running.
    const oldChildren = Array.from(partialWrapper.children) as HTMLElement[];
    let oldChildrenRemovalTimeoutId: NodeJS.Timeout | null = null;
    for (const child of oldChildren) {
        child.style.display = 'none';
    }


    // Preserve styles we temporarily override so they can be restored on rollback.
    const prevPosition = partialWrapper.style.position;
    const prevMinHeight = partialWrapper.style.minHeight;
    partialWrapper.style.position = 'relative'; // TODO: maybe this screws with loading spinner?
    partialWrapper.style.minHeight = `${currentHeight}px`;

    const { barrier, spinnerWrapper } = addLoadingOverlay(partialWrapper, currentHeight);

    /** Rolls back the temporary style changes and removes any added elements. */
    const rollback = (extraIframe?: HTMLIFrameElement | null): void => {
        barrier.remove();
        spinnerWrapper.remove();
        extraIframe?.remove();
        partialWrapper.style.position = prevPosition;
        partialWrapper.style.minHeight = prevMinHeight;

        if (oldChildrenRemovalTimeoutId) {
            clearTimeout(oldChildrenRemovalTimeoutId);
            console.log(`${LOG} Child removal canceled.`);
        }
    };

    // Declare iframe here so the cleanup closure can reference it before
    // createAndLoadIframe resolves.
    let inFlightIframe: HTMLIFrameElement | null = null;

    const isCancelled = registerInFlight(targetPartial.selector, () => {
        rollback(inFlightIframe);
        inFlightIframe = null;
    });

    // Scroll the top-level page to the very top so the spinner is visible.
    window.top!.scrollTo({ top: 0, behavior: 'smooth' });

    console.log(`${LOG} Loading "${targetUrl}" in new iframe…`);
    const iframe = await createAndLoadIframe(partialWrapper, barrier, targetUrl, currentHeight);
    inFlightIframe = iframe;

    if (isCancelled()) {
        console.log(`${LOG} Swap to "${targetUrl}" was superseded - aborting.`);
        iframe?.remove();
        return;
    }

    if (!iframe) {
        console.error(`${LOG} iframe failed to load - falling back.`);
        rollback();
        clearInFlight(targetPartial.selector);
        window.top!.location.href = targetUrl;
        return;
    }



    console.log(`${LOG} Waiting for iframe DOM to stabilise…`);
    await waitForIframeStable(iframe);
    console.log(`${LOG} iframe DOM stable, proceeding with isolation.`);

    if (isCancelled()) {
        console.log(`${LOG} Swap to "${targetUrl}" was superseded after stabilisation - aborting.`);
        return;
    }

    const partialDoc = iframe.contentDocument;
    if (!partialDoc) {
        console.warn(`${LOG} iframe contentDocument unavailable - falling back.`);
        rollback(iframe);
        clearInFlight(targetPartial.selector);
        window.top!.location.href = targetUrl;
        return;
    }


    const innerElement = isolateIframe(partialDoc, targetPartial.selector);
    console.log('Isolated');
    if (!innerElement) {
        console.warn(`${LOG} Selector "${targetPartial.selector}" not found in iframe - falling back.`);
        rollback(iframe);
        clearInFlight(targetPartial.selector);
        window.top!.location.href = targetUrl;
        return;
    }

    innerElement.dataset.isInnerPartialElement = 'true';

    // --- Finalise ---
    console.log('entering finalize');
    // Promote the iframe to normal flow.
    // Fix (a): Only remove old children that are iframes (to free their resources);
    // non-iframe children are kept hidden so fix (b) can restore them if an inner
    // partial later tries to navigate back to this same URL.
    iframe.style.position = 'static';
    iframe.style.visibility = 'visible';
    oldChildrenRemovalTimeoutId = setTimeout(() => {
        console.log(`${LOG} Marking old iframes for removal`);
        console.log(oldChildren);
        console.log(partialWrapper.children);
        for (const child of oldChildren) {
            console.log(child)
            console.log(child instanceof HTMLIFrameElement)
            console.log(child.tagName)
            if (child.tagName === 'IFRAME') { // instanceof doesnt work across iframes
                console.log(`${LOG} Removing iframe ${(child as HTMLIFrameElement).src}`);
                child.remove();
            }
        }
    }, 200);

    partialWrapper.style.position = prevPosition;
    partialWrapper.style.minHeight = '';
    fadeOutOverlay(barrier, spinnerWrapper);
    console.log('finalized');

    return new PartialElement(partialDoc, iframe, innerElement);
}