import FeatureGroup from '@/FeatureGroup';
import { attach, detach } from './lib/linkHandler';
import { Partial, patternToRegex } from './lib/Partial';
import { applyPartial } from './lib/partialHandler';

/** All registered partials, checked in order on each navigation. */
const partials: Partial[] = [
    new Partial('#page', [patternToRegex('MOODLE_URL/my/*')]),
];

/**
 * Handles browser back/forward navigation (popstate). If the restored URL
 * matches a partial, performs a partial swap instead of a full reload.
 */
const onPopState = (): void => {
    const targetUrl = window.location.href;
    const matched = partials.find(p => p.matches(targetUrl));
    if (!matched) return;

    console.log('[better-moodle/partials] popstate → partial swap to', targetUrl);
    void applyPartial(matched, targetUrl, false);
};

export default FeatureGroup.register({
    onload() {
        const currentUrl = window.location.href;
        const matched = partials.filter(p => p.matches(currentUrl));

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
        window.addEventListener('popstate', onPopState);
    },

    onunload() {
        detach();
        window.removeEventListener('popstate', onPopState);
    },
});

