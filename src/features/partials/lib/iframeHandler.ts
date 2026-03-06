const LOG = '[better-moodle/partials/iframeHandler]';

/**
 * Creates an iframe pointing at `targetUrl`, inserts it into `wrapper` behind
 * `barrier`, and resolves once the `load` event fires.
 * @param wrapper   - the wrapper to insert the iframe into
 * @param barrier   - the barrier element — iframe is inserted before this
 * @param targetUrl - the URL to load
 * @param height    - initial height for the iframe
 * @returns the iframe element, or null if loading failed
 */
export const createAndLoadIframe = async (
    wrapper: HTMLElement,
    barrier: HTMLDivElement,
    targetUrl: string,
    height: number,
): Promise<HTMLIFrameElement | null> => {
    const iframe = wrapper.ownerDocument.createElement('iframe');
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
export const waitForIframeStable = (iframe: HTMLIFrameElement): Promise<void> =>
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
export const isolateIframe = (
    iframeDoc: Document,
    selector: string,
): HTMLElement | null => {
    const partialEl = iframeDoc.querySelector<HTMLElement>(selector);
    if (!partialEl) return null;

    console.groupCollapsed(`${LOG} iframe body BEFORE isolation`);
    Array.from(iframeDoc.body.children).forEach((child, i) => {
        const cls = child.getAttribute('class') ?? '';
        console.log(i, child.tagName, child.id, cls.slice(0, 60));
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
                parent.id || (parent.getAttribute('class') ?? '').slice(0, 40),
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
        const cls = child.getAttribute('class') ?? '';
        console.log(i, child.tagName, child.id, cls.slice(0, 60));
    });
    console.groupEnd();

    return partialEl;
};