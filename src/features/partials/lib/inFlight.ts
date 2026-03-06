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
export const registerInFlight = (
    selector: string,
    cleanup: () => void,
): (() => boolean) => {
    // Cancel and clean up any swap already running for this selector.
    const swap = inFlight.get(selector);
    swap?.cancel();
    swap?.cleanup();

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
export const clearInFlight = (selector: string): void => {
    inFlight.delete(selector);
};