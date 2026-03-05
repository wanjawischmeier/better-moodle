import FeatureGroup from '@/FeatureGroup';
import { attach, detach } from './lib/linkHandler';
import { PartialFragment, patternToRegex } from './lib/Partial';
import { applyPartial } from './lib/partialHandler';

/** All registered partials, checked in order on each navigation. */
const partials: PartialFragment[] = [
    // All course pages with a content section
    new PartialFragment('#page-content', [
        patternToRegex('MOODLE_URL/course/view.php?id=*'),
        patternToRegex('MOODLE_URL/user/index.php?id=*'),
        patternToRegex('MOODLE_URL/grade/report/index.php?id=*'),
    ], {
        condition: (currentUrl: string, targetUrl: string) => {
            const currentId = new URL(currentUrl).searchParams.get('id');
            const targetId = new URL(targetUrl).searchParams.get('id');
            return currentId !== null && currentId === targetId;
        },
    }),

    // All pages with the main header
    new PartialFragment('#page', [
        patternToRegex('MOODLE_URL/my/'),
        patternToRegex('MOODLE_URL/my/*'),
        patternToRegex('MOODLE_URL/course/'),
        patternToRegex('MOODLE_URL/course/view.php?id=*'),
        patternToRegex('MOODLE_URL/course/section.php?id=*'),
        patternToRegex('MOODLE_URL/user/index.php?id=*'),
        patternToRegex('MOODLE_URL/grade/report/index.php?id=*'),
        patternToRegex('MOODLE_URL/message/*'),
        patternToRegex('MOODLE_URL/calendar/*'),
        patternToRegex('MOODLE_URL/user/files.php'),
        patternToRegex('MOODLE_URL/user/preferences.php'),
        patternToRegex('MOODLE_URL/reportbuilder/index.php'),
        patternToRegex('MOODLE_URL/mod/forum/*'),
        patternToRegex('MOODLE_URL/mod/quiz/*'),
        patternToRegex('MOODLE_URL/mod/assign/*'),
        patternToRegex('MOODLE_URL/mod/choicegroup/*'),
    ], {
        pinUrls: [
            patternToRegex('MOODLE_URL/my/'),
            patternToRegex('MOODLE_URL/my/courses.php'),
            patternToRegex('MOODLE_URL/course/'),
        ]
    }),
];

/**
 * Handles browser back/forward navigation (popstate). If the restored URL
 * matches a partial, performs a partial swap instead of a full reload.
 * Always bound on window.top so it fires regardless of whether the feature
 * is running in the top frame or inside a partial iframe.
 */
const onPopState = (): void => {
    const targetUrl = window.top!.location.href;
    const matched = partials.find(p => p.matches(targetUrl));
    if (!matched) return;

    console.log('[better-moodle/partials] popstate → partial swap to', targetUrl);
    void applyPartial(matched, targetUrl, false);
};

export default FeatureGroup.register({
    onload() {
        const currentUrl = window.top!.location.href;
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
        window.top!.addEventListener('popstate', onPopState);
    },

    onunload() {
        detach();
        window.top!.removeEventListener('popstate', onPopState);
    },
});

