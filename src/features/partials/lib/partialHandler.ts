import { Partial } from './Partial';

/**
 * Loads the target URL in an off-screen hidden iframe, isolates the partial
 * element inside it, then replaces the host element with the sized iframe.
 *
 * The host element stays visible with a spinner overlaid during loading so
 * layout is undisturbed. The iframe is inserted into the live DOM only once
 * it is fully prepared, eliminating any flash of unstyled content.
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

    // --- Overlay a spinner on top of the existing element ---
    // Keep current in place so layout is undisturbed while the iframe loads.
    // We use a CSS-only spinner so it shows immediately without waiting for
    // an async Moodle template render.
    const spinnerWrapper = document.createElement('div');
    spinnerWrapper.style.cssText =
        'position:absolute;inset:0;display:flex;align-items:center;' +
        'justify-content:center;background:rgba(255,255,255,0.6);z-index:9999;';
    const spinnerEl = document.createElement('div');
    spinnerEl.className = 'spinner-border text-primary';
    spinnerEl.setAttribute('role', 'status');
    spinnerWrapper.appendChild(spinnerEl);

    const previousPosition = current.style.position;
    if (!['relative', 'absolute', 'fixed', 'sticky'].includes(getComputedStyle(current).position)) {
        current.style.position = 'relative';
    }
    current.appendChild(spinnerWrapper);
    console.log(`[better-moodle/partials] Spinner overlaid on "${partial.selector}".`);

    // --- Load the target URL in an iframe, shown immediately ---
    // The spinner overlaid on current is still visible on top.
    // Once isolation is done we remove the spinner.
    const iframe = document.createElement('iframe');
    iframe.style.cssText = `border:0;padding:0;margin:0;display:block;`;
    iframe.src = targetUrl;
    // Insert the iframe right after current so it occupies the same spot.
    // current stays in the DOM so the spinner wrapper keeps its position.
    current.insertAdjacentElement('afterend', iframe);

    const loadOk = await new Promise<boolean>(resolve => {
        iframe.addEventListener('load', () => resolve(true), { once: true });
        iframe.addEventListener('error', () => resolve(false), { once: true });
    });

    if (!loadOk) {
        console.error('[better-moodle/partials] iframe failed to load – falling back.');
        iframe.remove();
        spinnerWrapper.remove();
        current.style.position = previousPosition;
        window.location.href = targetUrl;
        return;
    }

    // Wait for Moodle's AMD modules to finish mutating the iframe DOM after
    // the load event. We use a MutationObserver that resets a timer on every
    // change; once the DOM has been stable for 500 ms we proceed.
    console.log('[better-moodle/partials] Waiting for iframe DOM to stabilise…');
    await new Promise<void>(resolve => {
        let timer = setTimeout(resolve, 1000);
        const obs = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                obs.disconnect();
                resolve();
            }, 1000);
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
        iframe.remove();
        spinnerWrapper.remove();
        current.style.position = previousPosition;
        window.location.href = targetUrl;
        return;
    }

    const partialEl = iframeDoc.querySelector<HTMLElement>(partial.selector);
    if (!partialEl) {
        console.warn(
            `[better-moodle/partials] Selector "${partial.selector}" not found in iframe – falling back.`
        );
        iframe.remove();
        spinnerWrapper.remove();
        current.style.position = previousPosition;
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

    // --- Finalise: size the iframe, transfer identity, remove old element ---
    // Transfer id/class so external querySelector('#page') keeps resolving.
    
    iframe.id = current.id;
    iframe.className = current.className;

    /** Syncs the iframe height to the scrollHeight of the partial element. */
    const syncHeight = () => {
        iframe.style.height = `${partialEl.scrollHeight}px`;
    };
    syncHeight();
    new ResizeObserver(syncHeight).observe(partialEl);

    // Remove the original element (spinner goes with it).
    current.remove();

    window.history.pushState(null, '', targetUrl);
    console.log(
        `[better-moodle/partials] Partial "${partial.selector}" applied successfully.`
    );
};
