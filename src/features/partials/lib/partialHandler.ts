import { PartialFragment } from './Partial';
import {
    activateIframe,
    attachHeightSync,
    getCached,
    getOrCreateCache,
    isCached,
    normaliseUrl,
    removeUncachedIframes,
    storeCached,
} from './partialCache';

const LOG = '[better-moodle/partials]';

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
        'position:absolute;inset:0;background:rgba(255,255,255,1);z-index:1;pointer-events:none;';

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
        `position:absolute;top:0;left:0;height:${height}px;z-index:0;visibility:hidden;`;
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
                if (child !== keep) child.remove();
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
 * Subsequent calls for already-cached URLs are instant — the existing iframe
 * is revealed immediately without a network request.
 * @param partial      - the partial that matched the navigation
 * @param targetUrl    - the URL the user is navigating to
 * @param pushHistory  - whether to push a new history entry (false when
 *                       called from a popstate handler where the URL is
 *                       already correct)
 */
export const applyPartial = async (
    partial: PartialFragment,
    targetUrl: string,
    pushHistory = true,
): Promise<void> => {
    const normUrl = normaliseUrl(targetUrl);

    console.log(
        `${LOG} Applying partial "${partial.selector}":`,
        window.top!.location.href,
        '->',
        targetUrl,
    );

    const current = document.querySelector<HTMLElement>(partial.selector);
    if (!current) {
        console.warn(`${LOG} Selector "${partial.selector}" not found – falling back.`);
        window.top!.location.href = targetUrl;
        return;
    }

    const currentHeight = current.scrollHeight;
    const entry = getOrCreateCache(partial, current);
    const { wrapper } = entry;

    // --- Cache hit: show existing iframe immediately ---
    if (isCached(partial.selector, normUrl)) {
        console.log(`${LOG} Cache hit for "${normUrl}" — showing instantly.`);
        const cached = getCached(partial.selector, normUrl)!;
        activateIframe(entry, normUrl);
        attachHeightSync(entry, cached.iframe, cached.partialEl);
        if (pushHistory) window.top!.history.pushState(null, '', targetUrl);
        return;
    }

    // --- Cache miss: load in a new iframe ---
    // Scroll to the top of the wrapper so the spinner is always in view.
    wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const { barrier, spinnerWrapper } = addLoadingOverlay(wrapper, currentHeight);

    console.log(`${LOG} Loading "${targetUrl}" in new iframe…`);
    const iframe = await createAndLoadIframe(wrapper, barrier, targetUrl, currentHeight);

    if (!iframe) {
        console.error(`${LOG} iframe failed to load – falling back.`);
        barrier.remove();
        spinnerWrapper.remove();
        window.top!.location.href = targetUrl;
        return;
    }

    console.log(`${LOG} Waiting for iframe DOM to stabilise…`);
    await waitForIframeStable(iframe);
    console.log(`${LOG} iframe DOM stable, proceeding with isolation.`);

    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc) {
        console.warn(`${LOG} iframe contentDocument unavailable – falling back.`);
        barrier.remove();
        spinnerWrapper.remove();
        iframe.remove();
        window.top!.location.href = targetUrl;
        return;
    }

    const partialEl = isolateIframe(iframeDoc, partial.selector);
    if (!partialEl) {
        console.warn(`${LOG} Selector "${partial.selector}" not found in iframe – falling back.`);
        barrier.remove();
        spinnerWrapper.remove();
        iframe.remove();
        window.top!.location.href = targetUrl;
        return;
    }

    // --- Store, activate, finalise ---
    storeCached(partial.selector, normUrl, { iframe, partialEl });
    activateIframe(entry, normUrl);
    // Remove any iframes left over from previous swaps that weren't stored in
    // the cache (e.g. when caching is disabled).
    removeUncachedIframes(entry, iframe);

    iframe.style.position = 'static';
    iframe.style.visibility = 'visible';
    attachHeightSync(entry, iframe, partialEl);
    wrapper.style.minHeight = '';
    wrapper.style.margin = '0';
    wrapper.style.padding = '0';

    if (pushHistory) window.top!.history.pushState(null, '', targetUrl);
    fadeOutOverlay(barrier, spinnerWrapper);

    console.log(`${LOG} Partial "${partial.selector}" applied successfully.`);
};
