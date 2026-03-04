import { Partial } from './Partial';
import { getLoadingSpinner } from '@/DOM';
import { request } from '@/network';
import { requirePromise } from '@/require.js';

/**
 * Parses `M.cfg` out of the inline head scripts of a fetched Moodle document
 * and merges it into the live `M.cfg`.  Many AMD modules read M.cfg at
 * runtime (contextid, sesskey, courseId, …) so this must happen before any
 * body scripts are executed.
 * @param incoming - the fetched document
 */
const updateMoodleConfig = (incoming: Document): void => {
    // M.cfg is assigned as a plain object literal inside a <script> in <head>.
    // We look for the canonical pattern Moodle has used since at least 3.x:
    //   M.cfg = {...};
    for (const script of incoming.head.querySelectorAll<HTMLScriptElement>(
        'script:not([src])'
    )) {
        const text = script.textContent ?? '';
        const match = /M\.cfg\s*=\s*(\{[\s\S]*?\});/.exec(text);
        if (!match) continue;
        try {
            const newCfg = JSON.parse(match[1]) as Record<string, unknown>;
            Object.assign(M.cfg, newCfg);
            console.log(
                '[better-moodle/partials] M.cfg updated:',
                newCfg
            );
        } catch (e) {
            console.warn(
                '[better-moodle/partials] Failed to parse M.cfg from fetched document.',
                e
            );
        }
        break;
    }
};

/**
 * Syncs the live <body> element's `id` and `class` to those of the fetched
 * document.  Moodle uses body classes like `page-my-index`, `path-my`, etc.
 * as selectors in both CSS and JS, so mismatches cause widgets to not init.
 * @param incoming - the fetched document
 */
const syncBodyAttributes = (incoming: Document): void => {
    const { id, className } = incoming.body;
    if (id) {
        document.body.id = id;
        console.log('[better-moodle/partials] body#id →', id);
    }
    if (className) {
        document.body.className = className;
        console.log('[better-moodle/partials] body.class →', className);
    }
};

/**
 * Extracts all inline scripts from a document's body and runs them through
 * Moodle's template JS runner, then notifies the filter system about the
 * updated content.  This replicates what Moodle does internally after a
 * template render so that AMD modules (dynamic widgets, grade tables, etc.)
 * initialise correctly after a partial swap.
 * @param incoming  - the fetched document whose body scripts should be run
 * @param inserted  - the element that was just inserted into the live DOM
 */
const runPageScripts = async (
    incoming: Document,
    inserted: Element
): Promise<void> => {
    // Must happen before scripts run so AMD modules see correct context.
    updateMoodleConfig(incoming);
    syncBodyAttributes(incoming);

    // Collect every inline <script> in the body of the fetched document.
    // We intentionally skip <script src="…"> – those are already loaded by the
    // live page (RequireJS itself, jQuery, etc.) and must not be re-evaluated.
    const inlineScripts = Array.from(
        incoming.body.querySelectorAll<HTMLScriptElement>('script:not([src])')
    )
        .map(s => s.textContent ?? '')
        .filter(Boolean);

    const [templates, filterEvents] = await requirePromise([
        'core/templates',
        'core_filters/events',
    ] as const);

    if (inlineScripts.length) {
        console.log(
            `[better-moodle/partials] Running ${inlineScripts.length} inline script(s)…`
        );
        inlineScripts.forEach((script, i) => {
            console.groupCollapsed(
                `[better-moodle/partials] Script ${i + 1}/${inlineScripts.length}`
            );
            console.log(script.trim());
            console.groupEnd();
        });
        // runTemplateJS is how Moodle executes JS that accompanies rendered
        // templates – it handles the AMD require() calls correctly.
        templates.runTemplateJS(inlineScripts.join('\n'));
    } else {
        console.log(
            '[better-moodle/partials] No inline scripts found in fetched document.'
        );
    }

    // Tell Moodle's filter system that new content is in the DOM so that
    // things like MathJax, glossary auto-linking, etc. are applied.
    filterEvents.notifyFilterContentUpdated([inserted]);

    // core/first.start() is what javascript-static.js calls on a real page
    // load to scan the DOM for data-init attributes and bootstrap all AMD
    // block/widget modules.  We must call it again so the new content gets
    // the same treatment.  core/first is not in the typed module map so we
    // use the raw requirejs global.
    await new Promise<void>(resolve => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (requirejs as unknown as (deps: string[], cb: (m: any) => void) => void)(['core/first'], (first: any) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            console.log('[better-moodle/partials] core/first module:', first, 'keys:', Object.keys(first ?? {}));
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (typeof first?.start === 'function') {
                console.log('[better-moodle/partials] Calling core/first.start(M.cfg)…');
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                first.start(M.cfg);
            } else {
                console.warn('[better-moodle/partials] core/first.start is not a function – skipping.');
            }
            resolve();
        });
    });

    console.log('[better-moodle/partials] Page scripts executed.');
};

/**
 * Fetches the HTML of a URL and returns it as a parsed Document.
 * @param url - the URL to fetch
 * @returns the parsed Document
 */
const fetchDocument = async (url: string): Promise<Document> => {
    console.log('[better-moodle/partials] Fetching document:', url);
    const response = await request(url);
    const html = await response.text();
    return new DOMParser().parseFromString(html, 'text/html');
};

/**
 * Applies the partial-switching logic for the given partial and target URL.
 * Replaces the element matching the partial's selector with a loading spinner,
 * fetches the target URL, then swaps the spinner for the matching element from
 * the fetched document.
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

    const current = document.querySelector(partial.selector);
    if (!current) {
        console.warn(
            `[better-moodle/partials] Selector "${partial.selector}" not found on current page – falling back to full navigation.`
        );
        window.location.href = targetUrl;
        return;
    }

    // Show the spinner while the new content is loading.
    const spinner = await getLoadingSpinner();
    current.replaceWith(spinner);
    console.log(
        `[better-moodle/partials] Spinner shown for "${partial.selector}".`
    );

    let incoming: Document;
    try {
        incoming = await fetchDocument(targetUrl);
    } catch (err) {
        console.error(
            '[better-moodle/partials] Fetch failed – falling back to full navigation.',
            err
        );
        window.location.href = targetUrl;
        return;
    }

    const replacement = incoming.querySelector(partial.selector);
    if (!replacement) {
        console.warn(
            `[better-moodle/partials] Selector "${partial.selector}" not found in fetched document – falling back to full navigation.`
        );
        window.location.href = targetUrl;
        return;
    }

    spinner.replaceWith(replacement);
    // Keep the browser URL in sync with the navigation that just happened.
    window.history.pushState(null, '', targetUrl);
    console.log(
        `[better-moodle/partials] Partial "${partial.selector}" applied successfully.`
    );

    // Re-run the page's AMD initialisation scripts so that Moodle's
    // dynamically-rendered widgets work in the swapped content.
    await runPageScripts(incoming, replacement);
};
