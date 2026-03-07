import { createAndLoadIframe, isolateIframe, waitForIframeStable } from "./iframeHandler";
import { clearInFlight, registerInFlight } from "./inFlight";
import { addLoadingOverlay, removeAllLoadingOverlays } from "./loadingOverlay";
import { PartialElement, PartialFragment } from "./Partial";
import { restorePrePatchStyles } from "./partialManager";

const LOG = '[better-moodle/partials/partialHandler]';

// ---------------------------------------------------------------------------
// Ancestor-partial detection (fix for nested iframes with duplicate src)
// ---------------------------------------------------------------------------

/**
 * Walks the iframe ancestor chain to find the **outermost** ancestor window
 * whose document contains a partial element matching `partial.spec.selector`
 * with `dataset.partialUrl` equal to `targetUrl`.  When found, the hidden
 * original children of that wrapper are restored and any partial iframes
 * inside it are removed — which cascades and destroys all nested iframes,
 * including the current one.
 *
 * This prevents the browser from blocking a nested iframe that would otherwise
 * navigate to the same URL as one of its ancestor partials.
 *
 * Windows iterated (innermost → outermost):
 *   window.parent
 *   window.parent.parent
 *   …  window.top
 * The outermost (last) matching window is used so the minimal subtree is torn
 * down.
 * @param partial   - the partial whose selector identifies candidate wrappers
 * @param targetUrl - the URL being navigated to
 * @returns `true` if an ancestor match was found and handled
 */
export function restoreMatchingOuterPartial(partial: PartialFragment, targetUrl: string): boolean {
    let targetHref: string;
    try {
        targetHref = new URL(targetUrl, window.location.href).href;
    } catch {
        return false;
    }
    console.log(`Target href: ${targetHref}`)
    let outermost: HTMLElement | null = null;

    // Walk from window.parent up to window.top, querying each document for a
    // partial wrapper whose dataset.partialUrl matches the target URL.
    let ancestorWin: Window = window.parent;
    while (true) {
        try {
            const match = ancestorWin.document.querySelector<HTMLElement>(partial.spec.selector);
            console.log(`Match, target: ${targetHref}, target url = ${targetUrl}`)
            console.log(match)
            console.log(match?.dataset.partialUrl)
            console.log(match?.dataset.partialUrl === targetHref)
            if (match?.dataset.partialUrl === targetHref) {
                // Keep updating so we end up with the outermost (last) match.
                outermost = match;
            }
        } catch {
            // Cross-origin ancestor — stop walking.
            break;
        }

        if (ancestorWin === window.top) break;
        ancestorWin = ancestorWin.parent;
    }

    if (!outermost) return false;

    const wrapper = outermost;
    console.log('Outmost wrapper found')
    console.log(wrapper)
    
    delete wrapper.dataset.partialUrl;
    restorePrePatchStyles(partial, wrapper);

    // Snapshot children before mutating the DOM.
    const children = Array.from(wrapper.children) as HTMLElement[];

    // Un-hide the original children that were preserved by fix (a),
    // and remove any partial iframes (destroys all nested iframes too).
    for (const child of children) {
        if (child.dataset.isPartialIframe === 'true') {
            child.remove();
        } else {
            child.style.display = child.dataset.display ?? '';
        }
    }

    removeAllLoadingOverlays(wrapper.ownerDocument);

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
    let match: HTMLElement | null = doc.querySelector<HTMLElement>(partial.spec.selector);
    if (match && partial.spec.preferTopDocMatch) return match;

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


export async function swapPartials(partialWrapper: HTMLElement, targetPartial: PartialFragment, sourceUrl: string, targetUrl: string): Promise<PartialElement | undefined> {
    if (!window.top) {
        console.error(`${LOG} Failed to swap partials - top window not defined`);
        return;
    }
    
    const currentHeight = partialWrapper.scrollHeight;

    // --- Layer new content directly inside the existing element ---
    // We mutate `current` in-place so there is never a duplicate #id in the DOM.
    // Child stacking order (top → bottom):
    //   spinnerWrapper  position:absolute  z-index:2
    //   barrier         position:absolute  z-index:1
    //   new iframe      position:absolute  z-index:0
    //   old children    normal flow        (behind all positioned children)

    // Snapshot and hide existing children
    const oldChildren = Array.from(partialWrapper.children) as HTMLElement[];
    let oldIframeRemovalTimeoutId: NodeJS.Timeout | null = null;
    if (!partialWrapper.dataset.partialUrl) {
        // Remember url for existing children
        partialWrapper.dataset.partialUrl = sourceUrl;

        for (const child of oldChildren) {
            child.dataset.display = child.style.display;
            child.style.display = 'none';
        }
    }


    // Preserve styles we temporarily override so they can be restored on rollback.
    const prevPosition = partialWrapper.style.position;
    const prevMinHeight = partialWrapper.style.minHeight;
    partialWrapper.style.position = 'relative';
    partialWrapper.style.minHeight = `${currentHeight}px`;
    const oldWrapperMargin = partialWrapper.style.margin;
    partialWrapper.style.margin = ''; // Clear margin for loading screen

    const { barrier, spinnerWrapper } = addLoadingOverlay(partialWrapper, currentHeight);

    /** Rolls back the temporary style changes and removes any added elements. */
    const rollback = (extraIframe?: HTMLIFrameElement | null): void => {
        barrier.remove();
        spinnerWrapper.remove();
        extraIframe?.remove();
        partialWrapper.style.position = prevPosition;
        partialWrapper.style.minHeight = prevMinHeight;

        if (oldIframeRemovalTimeoutId) {
            clearTimeout(oldIframeRemovalTimeoutId);
            console.log(`${LOG} Child removal canceled.`);
        }
    };

    // Declare iframe here so the cleanup closure can reference it before
    // createAndLoadIframe resolves.
    let partialIframe: HTMLIFrameElement | null = null;

    const isCancelled = registerInFlight(targetPartial.spec.selector, () => {
        rollback(partialIframe);
        partialIframe = null;
    });

    // Scroll the top-level page to the very top so the spinner is visible.
    window.top.scrollTo({ top: 0, behavior: 'smooth' });

    console.log(`${LOG} Loading "${targetUrl}" in new iframe…`);
    partialIframe = await createAndLoadIframe(partialWrapper, barrier, targetUrl, currentHeight);

    if (isCancelled()) {
        console.log(`${LOG} Swap to "${targetUrl}" was superseded - aborting.`);
        partialIframe?.remove();
        return;
    }

    if (!partialIframe) {
        console.error(`${LOG} iframe failed to load - falling back.`);
        rollback();
        clearInFlight(targetPartial.spec.selector);
        window.top.location.href = targetUrl;
        return;
    }



    console.log(`${LOG} Waiting for iframe DOM to stabilise…`);
    await waitForIframeStable(partialIframe);
    console.log(`${LOG} iframe DOM stable, proceeding with isolation.`);

    if (isCancelled()) {
        console.log(`${LOG} Swap to "${targetUrl}" was superseded after stabilisation - aborting.`);
        return;
    }

    const iframeDoc = partialIframe.contentDocument;
    if (!iframeDoc) {
        console.warn(`${LOG} iframe contentDocument unavailable - falling back.`);
        rollback(partialIframe);
        clearInFlight(targetPartial.spec.selector);
        window.top.location.href = targetUrl;
        return;
    }


    const innerElement = isolateIframe(iframeDoc, targetPartial.spec.selector);
    console.log('Isolated');
    if (!innerElement) {
        console.warn(`${LOG} Selector "${targetPartial.spec.selector}" not found in iframe - falling back.`);
        rollback(partialIframe);
        clearInFlight(targetPartial.spec.selector);
        window.top.location.href = targetUrl;
        return;
    }

    innerElement.dataset.isInnerPartialElement = 'true';

    // --- Finalise ---
    console.log('entering finalize');
    // Promote the iframe to normal flow.
    // Fix (a): Only remove old children that are iframes (to free their resources);
    // non-iframe children are kept hidden so fix (b) can restore them if an inner
    // partial later tries to navigate back to this same URL.
    partialIframe.style.position = 'static';
    partialIframe.style.visibility = 'visible';
    oldIframeRemovalTimeoutId = setTimeout(() => {
        console.log(`${LOG} Marking old iframes for removal`);
        console.log(oldChildren);
        console.log(partialWrapper.children);
        for (const child of oldChildren) {
            console.log(child)
            console.log(child.dataset)
            console.log(child.tagName)
            if (child.dataset.isPartialIframe === 'true') { // instanceof doesnt work across iframes
                console.log(`${LOG} Removing partial iframe ${(child as HTMLIFrameElement).src}`);
                child.remove();
            }
        }
    }, 200);

    partialWrapper.style.position = prevPosition;
    partialWrapper.style.minHeight = '';
    partialWrapper.style.margin = oldWrapperMargin;
    removeAllLoadingOverlays(partialWrapper.ownerDocument);
    console.log('finalized');

    return new PartialElement(iframeDoc, partialIframe, innerElement);
}