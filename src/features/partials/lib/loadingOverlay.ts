const LOG = '[better-moodle/partials/loadingOverlay]';
const barrierClassName = 'partial-loading-barrier';
const spinnerClassName = 'partial-loading-spinner';

const fadeOutTransitionMs = 200;

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
    barrier.classList.add(barrierClassName);
    let backgroundColor = window.top!.getComputedStyle(document.body).backgroundColor;
    backgroundColor = backgroundColor.replace(')', ',0.95)');
    barrier.style.cssText =
        `position:absolute;inset:0;background:${backgroundColor};z-index:1;pointer-events:none;`;

    const spinnerWrapper = ownerDoc.createElement('div');
    spinnerWrapper.classList.add(spinnerClassName);
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

export function removeAllLoadingOverlays(doc: Document) {
    const barriers = doc.querySelectorAll<HTMLDivElement>(`.${barrierClassName}`);
    const spinners = doc.querySelectorAll<HTMLDivElement>(`.${spinnerClassName}`);

    console.log('barriers + spinners')
    console.log(barriers)
    console.log(spinners)

    for (const barrier of barriers) {
        barrier.style.transition = `opacity ${fadeOutTransitionMs}ms ease-out`;
        requestAnimationFrame(() => {
            barrier.style.opacity = '0';
        });
    }

    console.log(`${LOG} Removing spinners`);
    for (const spinnerWrapper of spinners) {
        spinnerWrapper.remove();
    }

    setTimeout(() => {
        console.log(`${LOG} Removing barriers`);
        for (const barrier of barriers) {
            barrier.remove();
        }
    }, fadeOutTransitionMs + 10);
}