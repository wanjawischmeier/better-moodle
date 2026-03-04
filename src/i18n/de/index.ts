import type { BaseTranslation } from '../i18n-types';
import { de as bookmarks } from '../../features/bookmarks/i18n';
import { de as courses } from '../../features/courses/i18n';
import { de as darkmode } from '../../features/darkmode/i18n';
import { de as dashboard } from '../../features/dashboard/i18n';
import { de as general } from '../../features/general/i18n';
import { de as linkIcons } from '../../features/linkIcons/i18n';
import { de as messages } from '../../features/messages/i18n';
import { de as navbarMarquee } from '../../features/navbarMarquee/i18n';
import { de as nina } from '../../features/nina/i18n';
import { de as partials } from '../../features/partials/i18n';
import { de as semesterzeiten } from '../../features/semesterzeiten/i18n';
import settings from './settings';
import { de as speiseplan } from '../../features/speiseplan/i18n';
import { de as weather } from '../../features/weather/i18n';

export default {
    settings,
    update: {
        btn: 'Update installieren',
        title: 'Better-Moodle aktualisieren',
        close: 'Ohne Neuladen schließen',
        reload: 'Moodle neuladen',
        body: `
Uiiii, ein Update für Better-Moodle ist bereit zur Installation 👀

Falls noch nicht geschehen, befolge bitte die Anweisungen deines Userscript-Managers, um das Update zu installieren. Ggf. wurde ein neuer Tab im Hintergrund geöffnet. Um das Update abzuschließen, lade bitte Moodle nach der Installation einmal neu.

Um zu erfahren, was sich seit deinem letzten Update getan hat, hier der relevante Auszug aus dem Changelog:
`.trim(),
    },
    support: {
        title: 'Hilfe zu Better-Moodle',
        close: 'Vielen Dank für die Hilfe! 😊',
    },
    language: { flag: '🇩🇪', name: 'Deutsch' },
    browserCheck: {
        title: 'Better-Moodle: Browser nicht unterstützt',
        browser: 'Browser',
        minVersion: 'Älteste noch unterstützte Version',
        dismiss: {
            version: 'Für diese Browser-Version ausblenden',
            session: 'Für diese Sitzung ausblenden',
        },
        body: `
Hallo!

Leider scheinst du einen Browser zu nutzen, der nicht offiziell von Better-Moodle unterstützt wird.
Daher kann es sein, dass manche Features nicht korrekt funktionieren.

Um möglichst modernen Code schreiben zu können und aus Sicherheitsgründen, empfiehlt Better-Moodle die Verwendung eines aktuellen Browsers.
Für weitere Informationen kann [https://better-moodle.dev](https://better-moodle.dev) konsultiert werden.

Die offiziell unterstützten Browser (Das Better-Moodle Core-Team empfiehlt Firefox):
`.trim(),
    },
    features: {
        bookmarks,
        courses,
        darkmode,
        dashboard,
        general,
        linkIcons,
        messages,
        navbarMarquee,
        nina,
        partials,
        semesterzeiten,
        speiseplan,
        weather,
    },
    numbers: {
        1: 'eins',
        2: 'zwei',
        3: 'drei',
        4: 'vier',
        5: 'fünf',
        6: 'sechs',
        7: 'sieben',
        8: 'acht',
        9: 'neun',
        10: 'zehn',
        11: 'elf',
        12: 'zwölf',
    },
} satisfies BaseTranslation;
