import FeatureGroup from '@/FeatureGroup';
import { attach, detach } from './lib/linkHandler';
import { Partial, patternToRegex } from './lib/Partial';

/** All registered partials, checked in order on each navigation. */
const partials: Partial[] = [
    new Partial('#page', [patternToRegex('MOODLE_URL/my/*')]),
];


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
    },

    onunload() {
        detach();
    },
});

