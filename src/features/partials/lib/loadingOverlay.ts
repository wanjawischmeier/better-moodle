const LOG = '[better-moodle/partials/loadingOverlay]';

/**
 * Appends a semi-transparent barrier and a spinner to `wrapper`, set above
 * whatever iframe content is beneath them.
 * @param wrapper   - the persistent wrapper element
 * @param minHeight - minimum height to hold open while loading
 * @returns references to the barrier and spinnerWrapper elements
 */
export const addLoadingOverlay = (
    wrapper: HTMLElement,
    minHeight: number,
): { barrier: HTMLDivElement; spinnerWrapper: HTMLDivElement } => {
    wrapper.style.minHeight = `${minHeight}px`;

    const ownerDoc = wrapper.ownerDocument;

    const barrier = ownerDoc.createElement('div');
    let backgroundColor = window.top!.getComputedStyle(document.body).backgroundColor;
    backgroundColor = backgroundColor.replace(')', ',0.95)');
    barrier.style.cssText =
        `position:absolute;inset:0;background:${backgroundColor};z-index:1;pointer-events:none;`;

    const spinnerWrapper = ownerDoc.createElement('div');
    spinnerWrapper.style.cssText =
        'position:absolute;top:0;left:0;right:0;display:flex;transform:translateY(8rem)' +
        'justify-content:center;z-index:2;pointer-events:none;';
    const spinnerEl = ownerDoc.createElement('div');
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
export const fadeOutOverlay = (
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
        console.log(`${LOG} Removing barrier and spinner`);
        barrier.remove();
        spinnerWrapper.remove();
    }, 110);
};