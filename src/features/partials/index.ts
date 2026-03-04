import FeatureGroup from '@/FeatureGroup';
import { attach, detach } from './lib/linkHandler';
import { Partial, patternToRegex } from './lib/Partial';

/** All registered partials, checked in order on each navigation. */
const partials: Partial[] = [
    new Partial('#page', [patternToRegex('MOODLE_URL/my/*')]),
];

/**
 * Records every `require([...], fn)` call so we know what AMD modules Moodle
 * bootstraps on a normal page load.  Wraps the global `requirejs` function
 * and restores it when `stopMonitoring` is called.
 * @returns stopMonitoring – call this to unwrap and print the full report
 */
const monitorAMD = (): (() => void) => {
    const calls: { deps: string[]; stack: string }[] = [];
    const original = requirejs;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, jsdoc/require-jsdoc
    (window as any).requirejs = function (
        deps: string | string[],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...rest: any[]
    ) {
        if (Array.isArray(deps)) {
            calls.push({
                deps,
                stack: new Error().stack?.split('\n').slice(2, 5).join(' | ') ?? '',
            });
            console.log('[better-moodle/partials] AMD require:', deps);
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        return (original as unknown as (...args: any[]) => unknown)(deps, ...rest);
    };
    // Copy static properties (require.config, etc.) onto the wrapper.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    Object.assign((window as any).requirejs, original);

    // eslint-disable-next-line jsdoc/require-jsdoc
    const stopMonitoring = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        (window as any).requirejs = original;
        console.groupCollapsed(
            `[better-moodle/partials] AMD monitor report – ${calls.length} require() call(s)`
        );
        calls.forEach(({ deps, stack }, i) => {
            console.log(`#${i + 1}`, deps, '|', stack);
        });
        console.groupEnd();
    };

    console.log(
        '[better-moodle/partials] AMD monitoring started. Navigate to another page and watch for require() calls. The report will print when monitoring stops.'
    );
    return stopMonitoring;
};

let stopAMDMonitoring: (() => void) | null = null;

export default FeatureGroup.register({
    onload() {
        const currentUrl = window.location.href;
        const matched = partials.filter(p => p.matches(currentUrl));

        // Start AMD monitoring unconditionally so we capture what Moodle calls
        // on every page load (both initial loads and after partial swaps).
        stopAMDMonitoring?.();
        stopAMDMonitoring = monitorAMD();
        // Print the report after 5 s – enough time for all AMD init to finish.
        setTimeout(() => {
            stopAMDMonitoring?.();
            stopAMDMonitoring = null;
        }, 5000);

        if (matched.length === 0) {
            console.log(
                '[better-moodle/partials] No partials match the current URL – skipping interception.',
                currentUrl
            );
            return;
        }

        console.log(
            `[better-moodle/partials] ${matched.length} partial(s) match the current URL – intercepting link clicks.`,
            matched.map(p => p.selector)
        );

        attach(partials);
    },

    onunload() {
        stopAMDMonitoring?.();
        stopAMDMonitoring = null;
        detach();
    },
});

