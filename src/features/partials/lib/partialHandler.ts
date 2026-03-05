import { PartialFragment } from './Partial';

const LOG = '[better-moodle/partials]';

// ---------------------------------------------------------------------------
// In-flight cancellation
// ---------------------------------------------------------------------------

interface InFlightCleanup {
    /** Marks the swap as cancelled so awaiting code exits early. */
    cancel: () => void;
    /** Removes the overlay + any not-yet-stored iframe from the wrapper. */
    cleanup: () => void;
}

/** One entry per selector — only one swap can be in progress at a time. */
const inFlight = new Map<string, InFlightCleanup>();

/**
 * Registers a new in-flight swap for `selector`, cancelling any previous one.
 * Returns an `isCancelled` predicate the caller checks after every await.
 * @param selector - CSS selector identifying the partial
 * @param cleanup  - removes the overlay/iframe if this swap is superseded
 * @returns a function that returns true once this swap has been superseded
 */
const registerInFlight = (
    selector: string,
    cleanup: () => void,
): (() => boolean) => {
    // Cancel and clean up any swap already running for this selector.
    inFlight.get(selector)?.cancel();
    inFlight.get(selector)?.cleanup();

    let cancelled = false;
    inFlight.set(selector, {
        /** Marks this swap as superseded so in-progress awaits exit early. */
        cancel: () => { cancelled = true; },
        cleanup,
    });
    return () => cancelled;
};

/**
 * Removes the in-flight record once a swap has finished successfully.
 * @param selector - the CSS selector whose in-flight record to clear
 */
const clearInFlight = (selector: string): void => {
    inFlight.delete(selector);
};

// ---------------------------------------------------------------------------
// Loading overlay
// ---------------------------------------------------------------------------

/**
 * Appends a semi-transparent barrier and a spinner to `wrapper`, set above
 * whatever iframe content is beneath them.
 * @param wrapper   - the persistent wrapper element
 * @param minHeight - minimum height to hold open while loading
 * @returns references to the barrier and spinnerWrapper elements
 */
const addLoadingOverlay = (
    wrapper: HTMLDivElement,
    minHeight: number,
): { barrier: HTMLDivElement; spinnerWrapper: HTMLDivElement } => {
    wrapper.style.minHeight = `${minHeight}px`;

    const barrier = document.createElement('div');
    barrier.style.cssText =
        'position:absolute;inset:0;background:rgba(255,255,255,0.9999);z-index:1;pointer-events:none;';

    const spinnerWrapper = document.createElement('div');
    spinnerWrapper.style.cssText =
        'position:absolute;left:0;right:0;display:flex;transform:translateY(4rem);' +
        'justify-content:center;z-index:2;pointer-events:none;';
    const spinnerEl = document.createElement('div');
    spinnerEl.className = 'spinner-border text-primary';
    spinnerEl.setAttribute('role', 'status');
    spinnerWrapper.appendChild(spinnerEl);

    wrapper.appendChild(barrier);
    wrapper.appendChild(spinnerWrapper);

    return { barrier, spinnerWrapper };
};

/**
 * Fades out `barrier` and `spinnerWrapper` over 100 ms then removes them.
 * @param barrier       - the white barrier element
 * @param spinnerWrapper - the spinner container element
 */
const fadeOutOverlay = (
    barrier: HTMLDivElement,
    spinnerWrapper: HTMLDivElement,
): void => {
    barrier.style.transition = 'opacity 100ms ease-out';
    spinnerWrapper.style.transition = 'opacity 100ms ease-out';
    requestAnimationFrame(() => {
        barrier.style.opacity = '0';
        spinnerWrapper.style.opacity = '0';
    });
    setTimeout(() => {
        barrier.remove();
        spinnerWrapper.remove();
    }, 110);
};

// ---------------------------------------------------------------------------
// iframe loading & isolation
// ---------------------------------------------------------------------------

/**
 * Creates an iframe pointing at `targetUrl`, inserts it into `wrapper` behind
 * `barrier`, and resolves once the `load` event fires.
 * @param wrapper   - the wrapper to insert the iframe into
 * @param barrier   - the barrier element — iframe is inserted before this
 * @param targetUrl - the URL to load
 * @param height    - initial height for the iframe
 * @returns the iframe element, or null if loading failed
 */
const createAndLoadIframe = async (
    wrapper: HTMLDivElement,
    barrier: HTMLDivElement,
    targetUrl: string,
    height: number,
): Promise<HTMLIFrameElement | null> => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText =
        'border:0;width:100%;display:block;overflow:hidden;' +
        `position:absolute;top:0;left:0;height:${height}px;z-index:0;`;
    iframe.src = targetUrl;
    // Insert behind barrier (lower DOM order = lower z-index).
    wrapper.insertBefore(iframe, barrier);

    const ok = await new Promise<boolean>(resolve => {
        iframe.addEventListener('load', () => resolve(true), { once: true });
        iframe.addEventListener('error', () => resolve(false), { once: true });
    });

    return ok ? iframe : null;
};

/**
 * Waits for the iframe body to stop mutating for 100 ms, indicating that
 * Moodle's AMD modules have finished their initial DOM work.
 * @param iframe - the iframe to observe
 */
const waitForIframeStable = (iframe: HTMLIFrameElement): Promise<void> =>
    new Promise<void>(resolve => {
        let timer = setTimeout(resolve, 100);
        const obs = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                obs.disconnect();
                resolve();
            }, 100);
        });
        obs.observe(iframe.contentDocument!.body, {
            childList: true,
            subtree: true,
            attributes: true,
        });
    });

/**
 * Removes all elements from the iframe that are not `selector` or its
 * ancestors, leaving only the target subtree.
 * @param iframeDoc - the iframe's document
 * @param selector  - CSS selector identifying the partial element
 * @returns the isolated element, or null if not found
 */
const isolateIframe = (
    iframeDoc: Document,
    selector: string,
): HTMLElement | null => {
    const partialEl = iframeDoc.querySelector<HTMLElement>(selector);
    if (!partialEl) return null;

    console.groupCollapsed(`${LOG} iframe body BEFORE isolation`);
    Array.from(iframeDoc.body.children).forEach((child, i) => {
        console.log(i, child.tagName, child.id, child.className.slice(0, 60));
    });
    console.groupEnd();

    let node: HTMLElement | null = partialEl;
    while (node && node !== iframeDoc.body) {
        const parent: HTMLElement | null = node.parentElement;
        if (parent) {
            const keep = node;
            const before = parent.children.length;
            Array.from(parent.children).forEach(child => {
                // Keep the target subtree and any drawer elements — drawers are
                // siblings of the partial in the DOM and Moodle's JS requires
                // them to be present to initialise correctly.
                if (child !== keep && !child.classList.contains('drawer')) {
                    child.remove();
                }
            });
            console.log(
                `${LOG} Removed ${before - 1} sibling(s) from`,
                parent.tagName,
                parent.id || parent.className.slice(0, 40),
            );
            parent.style.cssText = 'margin:0;padding:0;';
        }
        node = parent;
    }
    iframeDoc.body.style.cssText = 'margin:0;padding:0;overflow:hidden;';

    // Make all links that are not intercepted by the partial feature open in
    // the top-level page instead of navigating the iframe itself.
    // <base target="_top"> is the simplest way — no click listeners needed.
    const base = iframeDoc.createElement('base');
    base.target = '_top';
    iframeDoc.head.appendChild(base);

    console.groupCollapsed(`${LOG} iframe body AFTER isolation`);
    Array.from(iframeDoc.body.children).forEach((child, i) => {
        console.log(i, child.tagName, child.id, child.className.slice(0, 60));
    });
    console.groupEnd();

    return partialEl;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
    const topDoc = window.top!.document;

    const current = topDoc.querySelector<HTMLElement>(partial.selector);
    if (!current) {
        console.warn(`${LOG} Selector "${partial.selector}" not found – falling back.`);
        window.top!.location.href = targetUrl;
        return;
    }

    const currentHeight = current.scrollHeight;

    // --- Build the loading wrapper ---
    // Structure (back to front):
    //   <div wrapper>       ← replaces current in the DOM, preserves height
    //     <iframe/>         ← loads the target page
    //     <div barrier/>    ← white overlay while loading
    //     <div spinner/>    ← spinner on top
    //   </div>
    const wrapper = topDoc.createElement('div');
    wrapper.id = current.id;
    wrapper.className = current.className;
    wrapper.style.cssText = `position:relative;width:100%;min-height:${currentHeight}px;`;

    const { barrier, spinnerWrapper } = addLoadingOverlay(wrapper, currentHeight);

    // Declare iframe here so the cleanup closure can reference it before
    // createAndLoadIframe resolves.
    let inFlightIframe: HTMLIFrameElement | null = null;

    const isCancelled = registerInFlight(partial.selector, () => {
        wrapper.remove();
        inFlightIframe?.remove();
        inFlightIframe = null;
    });

    current.replaceWith(wrapper);
    // Scroll the top-level page to the very top so the spinner is visible.
    window.top!.scrollTo({ top: 0, behavior: 'smooth' });

    console.log(`${LOG} Loading "${targetUrl}" in new iframe…`);
    const iframe = await createAndLoadIframe(wrapper, barrier, targetUrl, currentHeight);
    inFlightIframe = iframe;

    if (isCancelled()) {
        console.log(`${LOG} Swap to "${targetUrl}" was superseded – aborting.`);
        iframe?.remove();
        return;
    }

    if (!iframe) {
        console.error(`${LOG} iframe failed to load – falling back.`);
        wrapper.replaceWith(current);
        clearInFlight(partial.selector);
        window.top!.location.href = targetUrl;
        return;
    }

    console.log(`${LOG} Waiting for iframe DOM to stabilise…`);
    await waitForIframeStable(iframe);
    console.log(`${LOG} iframe DOM stable, proceeding with isolation.`);

    if (isCancelled()) {
        console.log(`${LOG} Swap to "${targetUrl}" was superseded after stabilisation – aborting.`);
        return;
    }

    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc) {
        console.warn(`${LOG} iframe contentDocument unavailable – falling back.`);
        wrapper.replaceWith(current);
        clearInFlight(partial.selector);
        window.top!.location.href = targetUrl;
        return;
    }

    const partialEl = isolateIframe(iframeDoc, partial.selector);
    if (!partialEl) {
        console.warn(`${LOG} Selector "${partial.selector}" not found in iframe – falling back.`);
        wrapper.replaceWith(current);
        clearInFlight(partial.selector);
        window.top!.location.href = targetUrl;
        return;
    }

    // --- Finalise ---
    iframe.style.position = 'static';
    iframe.style.visibility = 'visible';
    wrapper.style.minHeight = '';
    wrapper.style.margin = '0';
    wrapper.style.padding = '0';

    /** Syncs the wrapper/iframe height to the partial element's scrollHeight. */
    const syncHeight = () => { iframe.style.height = `${partialEl.scrollHeight}px`; };
    syncHeight();
    new ResizeObserver(syncHeight).observe(partialEl);

    clearInFlight(partial.selector);
    if (pushHistory) window.top!.history.pushState(null, '', targetUrl);
    fadeOutOverlay(barrier, spinnerWrapper);

    console.log(`${LOG} Partial "${partial.selector}" applied successfully.`);
};
