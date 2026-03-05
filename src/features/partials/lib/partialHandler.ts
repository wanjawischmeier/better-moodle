import { Partial } from './Partial';

/** Sentinel attribute placed on the loading wrapper so it can be found and
 *  replaced if a second partial swap is triggered before the first finishes. */
const WRAPPER_ATTR = 'data-partial-loading';

/**
 * Loads the target URL in an iframe shown immediately in place of the current
 * content. A spinner and semi-transparent barrier sit on top while the iframe
 * finishes loading and is being isolated. Once ready the wrapper is removed
 * and the bare iframe takes its final position.
 *
 * Because the iframe shares the same origin we have full DOM access.
 * All of Moodle's JS runs natively in the iframe's own context — AMD modules,
 * event listeners and widgets all initialise exactly as on a real page load.
 * @param partial   - the partial that matched the navigation
 * @param targetUrl - the URL the user is navigating to
 */
export const applyPartial = async (
    partial: Partial,
    targetUrl: string
): Promise<void> => {
    window.history.pushState(null, '', targetUrl);
    console.log(
        `[better-moodle/partials] Applying partial "${partial.selector}":`,
        window.location.href,
        '->',
        targetUrl
    );

    const current = document.querySelector<HTMLElement>(partial.selector);
    if (!current) {
        console.warn(
            `[better-moodle/partials] Selector "${partial.selector}" not found on current page – falling back to full navigation.`
        );
        window.location.href = targetUrl;
        return;
    }

    // Record the current height so the loading area doesn't collapse.
    const currentHeight = current.scrollHeight;
    const currentId = current.id;
    const currentClassName = current.className;

    // --- Build the loading wrapper ---
    // Structure (back to front):
    //   <div wrapper>            ← takes the place of current, holds the height
    //     <iframe/>              ← loads in the background, visible but behind barrier
    //     <div barrier/>         ← semi-transparent overlay covering the iframe
    //     <div spinnerWrapper/>  ← spinner pinned to the top of the wrapper
    //   </div>
    const wrapper = document.createElement('div');
    wrapper.setAttribute(WRAPPER_ATTR, '');
    // Transfer identity so querySelector('#page') keeps resolving during load.
    wrapper.id = currentId;
    wrapper.className = currentClassName;
    wrapper.style.cssText =
        `position:relative;min-height:${currentHeight}px;width:100%;`;

    const iframe = document.createElement('iframe');
    iframe.style.cssText =
        'border:0;width:100%;display:block;overflow:hidden;position:absolute;' +
        `top:0;left:0;height:${currentHeight}px;z-index:0;`;
    iframe.src = targetUrl;

    const barrier = document.createElement('div');
    barrier.style.cssText =
        'position:absolute;inset:0;background:rgba(255,255,255,1);z-index:1;';

    const spinnerWrapper = document.createElement('div');
    spinnerWrapper.style.cssText =
        'position:absolute;top:4rem;left:0;right:0;display:flex;' +
        'justify-content:center;z-index:2;pointer-events:none;';
    const spinnerEl = document.createElement('div');
    spinnerEl.className = 'spinner-border text-primary';
    spinnerEl.setAttribute('role', 'status');
    spinnerWrapper.appendChild(spinnerEl);

    wrapper.appendChild(iframe);
    wrapper.appendChild(barrier);
    wrapper.appendChild(spinnerWrapper);

    // Replace current (or the previous loading wrapper) with the new wrapper.
    current.replaceWith(wrapper);
    console.log(`[better-moodle/partials] Loading wrapper inserted for "${partial.selector}".`);

    const loadOk = await new Promise<boolean>(resolve => {
        iframe.addEventListener('load', () => resolve(true), { once: true });
        iframe.addEventListener('error', () => resolve(false), { once: true });
    });

    if (!loadOk) {
        console.error('[better-moodle/partials] iframe failed to load – falling back.');
        wrapper.replaceWith(current);
        window.location.href = targetUrl;
        return;
    }

    // Wait for Moodle's AMD modules to finish mutating the iframe DOM after
    // the load event. We use a MutationObserver that resets a timer on every
    // change; once the DOM has been stable for 500 ms we proceed.
    console.log('[better-moodle/partials] Waiting for iframe DOM to stabilise…');
    await new Promise<void>(resolve => {
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
    console.log('[better-moodle/partials] iframe DOM stable, proceeding with isolation.');

    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc) {
        console.warn('[better-moodle/partials] iframe contentDocument unavailable – falling back.');
        wrapper.replaceWith(current);
        window.location.href = targetUrl;
        return;
    }

    const partialEl = iframeDoc.querySelector<HTMLElement>(partial.selector);
    if (!partialEl) {
        console.warn(
            `[better-moodle/partials] Selector "${partial.selector}" not found in iframe – falling back.`
        );
        wrapper.replaceWith(current);
        window.location.href = targetUrl;
        return;
    }
    console.log('[better-moodle/partials] partialEl found:', partialEl);

    // Log what's in the iframe body before we touch it.
    console.groupCollapsed('[better-moodle/partials] iframe body children BEFORE isolation');
    Array.from(iframeDoc.body.children).forEach((child, i) => {
        console.log(i, child.tagName, child.id, child.className.slice(0, 60));
    });
    console.groupEnd();

    // --- Isolate the partial element inside the iframe ---
    // Walk from partialEl up to <body>. At each level, remove every sibling
    // so only the ancestor chain leading to partialEl (and its children)
    // survives. Removal means no CSS battle with fixed/sticky elements.
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
                `[better-moodle/partials] Removed ${before - 1} sibling(s) from`,
                parent.tagName, parent.id || parent.className.slice(0, 40)
            );
            parent.style.cssText = 'margin:0;padding:0;';
        }
        node = parent;
    }
    iframeDoc.body.style.cssText = 'margin:0;padding:0;overflow:hidden;';

    // Log what remains after isolation.
    console.groupCollapsed('[better-moodle/partials] iframe body children AFTER isolation');
    Array.from(iframeDoc.body.children).forEach((child, i) => {
        console.log(i, child.tagName, child.id, child.className.slice(0, 60));
    });
    console.groupEnd();
    console.log('[better-moodle/partials] Iframe DOM isolated.');

    // --- Finalise: remove spinner/barrier, size iframe to fill wrapper ---
    // Do NOT move the iframe in the DOM — browsers reload iframes when they
    // are reparented, causing the white-flash re-load we saw before.
    // The wrapper already carries the correct id/className so external
    // querySelector('#page') keeps resolving to it.
    iframe.style.cssText = 'border:0;width:100%;display:block;overflow:hidden;';
    wrapper.style.cssText = 'display:block;margin:0;padding:0;';

    /** Syncs the iframe height to the scrollHeight of the partial element. */
    const syncHeight = () => {
        iframe.style.height = `${partialEl.scrollHeight}px`;
    };
    syncHeight();
    new ResizeObserver(syncHeight).observe(partialEl);

    // Fade out the barrier and spinner over 100 ms, then remove them.
    barrier.style.transition = 'opacity 100ms ease-out';
    spinnerWrapper.style.transition = 'opacity 100ms ease-out';
    requestAnimationFrame(() => {
        barrier.style.opacity = '0';
        spinnerWrapper.style.opacity = '0';
    });
    setTimeout(() => {
        barrier.remove();
        spinnerWrapper.remove();
        console.log(
            `[better-moodle/partials] Partial "${partial.selector}" applied successfully.`
        );
    }, 110);
};
