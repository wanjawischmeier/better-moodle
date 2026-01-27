import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as prettier from 'prettier';
import boxen from 'boxen';
import browserslist from 'browserslist';
import type Config from './configs/_config';
import { createHash } from 'crypto';
import dotenv from 'dotenv';
import { ESLint } from 'eslint';
import fastGlob from 'fast-glob';
import globalConfig from './configs/_global.json';
import icsParserConfig from './ics-parser/wrangler.json';
import monkey from 'vite-plugin-monkey';
import pluginTerser from '@rollup/plugin-terser';
import { resolveToEsbuildTarget } from 'esbuild-plugin-browserslist';
import { getUserAgentRegex as uaRegex } from 'browserslist-useragent-regexp';
import { defineConfig, type ResolverFunction } from 'vite';
import { dependencies, devDependencies, version } from './package.json';
import legacy, { detectPolyfills } from '@vitejs/plugin-legacy';

const _PERF_START = process.hrtime.bigint();

const PREFIX = globalConfig.prefix;

const configFile =
    process.argv
        .find(arg => arg.startsWith('--config='))
        ?.replace('--config=', '') ??
    new Error('No config specified. Please set a config with --config=...');

if (configFile instanceof Error) throw configFile;

const isReleaseBuild = process.argv.some(arg => arg === '--release');
const isChromeExtension = process.argv.some(arg => arg === '--chrome-extension');

const config = JSON.parse(
    await fs.readFile(`./configs/${configFile}.json`, 'utf-8')
) as Config;

const githubUrl = `https://github.com/${config.github.user}/${config.github.repo}`;
const releaseDownloadUrl = `${githubUrl}/releases/latest/download`;

const featuresBase = '/src/features/';
const allFeatureGroups = fastGlob
    .sync(`.${featuresBase}*/index.{ts,tsx}`)
    .map(f => f.replace(`.${featuresBase}`, '').replace(/\/index\.tsx?$/, ''));
const allFeatures = fastGlob
    .sync(`.${featuresBase}*/!(index).{ts,tsx}`)
    .map(f =>
        f
            .replace(`.${featuresBase}`, '')
            .replace(/\.tsx?$/, '')
            .replace('/', '.')
    )
    // anything with more than one dot is not a feature but an extra file
    .filter(f => /^[^.]+\.[^.]+$/.test(f));

const allIncludedFeatureGroups = new Set<string>(['general']);
const allFullyIncludedFeatureGroups = new Set<string>();
const allIncludedFeatures = new Set<string>();

const includedFeaturesByConfig =
    'includeFeatures' in config ? config.includeFeatures : [];
const excludedFeaturesByConfig =
    'excludeFeatures' in config ? config.excludeFeatures : [];
const includedNonDefaultFeaturesByConfig =
    'includeNonDefaultFeatures' in config ?
        new Set<string>(config.includeNonDefaultFeatures)
    :   new Set<string>();

const disabledByVersion = new Set<string>();
Object.entries(globalConfig.enabledFrom).forEach(([version, features]) => {
    if (config.moodleVersion < parseInt(version)) {
        features.forEach(feature => disabledByVersion.add(feature));
    }
});
Object.entries(globalConfig.disabledFrom).forEach(([version, features]) => {
    if (config.moodleVersion >= parseInt(version)) {
        features.forEach(feature => disabledByVersion.add(feature));
    }
});
const disabledByDefault = new Set<string>(globalConfig.defaultDisabled);

if (includedFeaturesByConfig.length) {
    // add the features that are included by config
    includedFeaturesByConfig.forEach(feature => {
        if (feature.includes('.')) {
            // this is a feature, not a group
            const group = feature.split('.')[0];
            // this feature or its group is disabled due to moodle version restrictions
            if (
                disabledByVersion.has(feature) ||
                disabledByVersion.has(group)
            ) {
                return;
            }
            // this feature is disabled by default and not manually included by config
            if (
                disabledByDefault.has(feature) &&
                !includedNonDefaultFeaturesByConfig.has(feature)
            ) {
                return;
            }
            // this feature group is disabled by default and not manually included by config
            if (
                disabledByDefault.has(group) &&
                !includedNonDefaultFeaturesByConfig.has(group)
            ) {
                return;
            }
            allIncludedFeatures.add(feature);
            allIncludedFeatureGroups.add(group);
        } else {
            // this is a group
            // this group is disabled due to moodle version restrictions
            if (disabledByVersion.has(feature)) return;
            // this group is disabled by default and not manually included by config
            if (
                disabledByDefault.has(feature) &&
                !includedNonDefaultFeaturesByConfig.has(feature)
            ) {
                return;
            }
            allIncludedFeatureGroups.add(feature);
            allFullyIncludedFeatureGroups.add(feature);
        }
    });
} else {
    // include all features except the ones disabled by version
    allFeatureGroups.forEach(group => {
        // this group is disabled due to moodle version restrictions
        if (disabledByVersion.has(group)) return;
        // this feature group is disabled by default and not manually included by config
        if (
            disabledByDefault.has(group) &&
            !includedNonDefaultFeaturesByConfig.has(group)
        ) {
            return;
        }
        allIncludedFeatureGroups.add(group);
        allFullyIncludedFeatureGroups.add(group);
    });
    allFeatures.forEach(feature => {
        // this feature is disabled due to moodle version restrictions
        if (disabledByVersion.has(feature)) return;
        // this feature is disabled by default and not manually included by config
        if (
            disabledByDefault.has(feature) &&
            !includedNonDefaultFeaturesByConfig.has(feature)
        ) {
            return;
        }
        allIncludedFeatures.add(feature);
    });

    // now exclude those excluded by config
    excludedFeaturesByConfig.forEach(feature => {
        // general group cannot be excluded
        if (feature === 'general') return;
        if (feature.includes('.')) {
            // this is a feature, not a group
            allIncludedFeatures.delete(feature);
            const group = feature.split('.')[0];
            allFullyIncludedFeatureGroups.delete(group);
        } else {
            // this is a group
            allFullyIncludedFeatureGroups.delete(feature);
            allIncludedFeatureGroups.delete(feature);
            allIncludedFeatures.forEach(f => {
                if (f.startsWith(`${feature}.`)) allIncludedFeatures.delete(f);
            });
        }
    });
}

const featureMd = Array.from(
    allIncludedFeatureGroups.values().map(
        group =>
            `* ${group}${Array.from(
                allIncludedFeatures
                    .values()
                    .filter(feat => feat.startsWith(`${group}.`))
                    .map(feat => `\n  * ${feat}`)
            ).join('')}`
    )
).join('\n');

// brace expansion wouldn't work with a single element only
if (allIncludedFeatureGroups.size === 1) {
    allIncludedFeatureGroups.add(crypto.randomUUID());
}

const featureGroupsGlob = `${featuresBase}{${Array.from(allIncludedFeatureGroups.values()).join(',')}}/index.{ts,tsx}`;

// brace expansion wouldn't work with no elements or a single element only
while (allIncludedFeatures.size <= 1) {
    allIncludedFeatures.add(crypto.randomUUID());
}

const featureGlob = `${featuresBase}{${Array.from(allIncludedFeatures.values())
    .map(f => (f.includes('.') ? f.replace('.', '/') : `${f}/!(index)`))
    .join(',')}}.{ts,tsx}`;

// we're again adding random UUIDs to not have empty brace expansion
const fixesGlob = `/src/fixes/{${crypto.randomUUID()},${crypto.randomUUID()},${(config.fixes ?? []).join(',')}}.{ts,tsx}`;

// @ts-expect-error because process.env may also include undefined values
dotenv.populate(process.env, {
    VITE_FEATURES_BASE: featuresBase,
    VITE_INCLUDE_FEATURE_GROUPS_GLOB: featureGroupsGlob,
    VITE_INCLUDE_7FEATURES_GLOB: featureGlob,
    VITE_INCLUDE_FIXES_GLOB: fixesGlob,

    // import globs defined for specific features
    VITE_SPEISEPLAN_CANTEEN_GLOB: `${featuresBase}speiseplan/canteens/${configFile}.ts`,
    VITE_SPEISEPLAN_PARSER_GLOB: `${featuresBase}speiseplan/parsers/${configFile}.ts`,
});

const requires: string[] = [];

/**
 * Adds an URL to the `@require` list, optionally with hash
 * @param url - the url to use
 * @param hashContent - the content to create the hash of
 */
const addRequire = (url: string, hashContent: false | string | Buffer) => {
    if (!hashContent) {
        requires.push(url);
        return;
    }

    requires.push(
        `${url}#sha512=${createHash('sha512')
            .update(hashContent)
            .digest('hex')}`
    );
};

if (allIncludedFeatureGroups.has('darkmode')) {
    addRequire(
        `https://unpkg.com/darkreader@${dependencies.darkreader}/darkreader.js`,
        await fs.readFile('./node_modules/darkreader/darkreader.js')
    );
}

const supportedBrowsers = browserslist();

const minSupportedBrowserVersions = new Map<string, number>();
supportedBrowsers.forEach(browser => {
    const [id, version] = browser.split(' ');
    const browserId = { and_ff: 'firefox (android)' }[id] ?? id;
    const minVersion =
        minSupportedBrowserVersions.get(browserId) ?? Number.MAX_SAFE_INTEGER;
    minSupportedBrowserVersions.set(
        browserId,
        Math.min(Number(version), minVersion)
    );
});

const uaRegexp = uaRegex({ allowHigherVersions: true });
const connectsByFeatures = Object.entries(globalConfig.connects).flatMap(
    ([feature, connects]) =>
        (
            allIncludedFeatureGroups.has(feature) ||
            allIncludedFeatures.has(feature)
        ) ?
            connects
        :   []
);
const connects = Array.from(
    new Set([
        'better-moodle.dev',
        ...(config.connects ?? []),
        ...connectsByFeatures,
    ])
);

const orderedFeatureGroups = globalConfig.featureGroupOrder.filter(group =>
    allIncludedFeatureGroups.has(group)
);

const GLOBAL_CONSTANTS = {
    __GITHUB_USER__: JSON.stringify(config.github.user),
    __GITHUB_REPO__: JSON.stringify(config.github.repo),
    __GITHUB_URL__: JSON.stringify(githubUrl),
    __GITHUB_BRANCH__: JSON.stringify(config.github.branch ?? 'main'),
    __VERSION__: JSON.stringify(version),
    __PREFIX__: JSON.stringify(PREFIX),
    __UNI__: JSON.stringify(configFile),
    __MOODLE_VERSION__: JSON.stringify(config.moodleVersion),
    __MOODLE_URL__: JSON.stringify(config.moodleUrl),
    __FEATURE_GROUPS__: JSON.stringify(['general', ...orderedFeatureGroups]),
    __USERSCRIPT_CONNECTS__: JSON.stringify(connects),
    __ICS_PARSER_DOMAIN__: JSON.stringify(icsParserConfig.routes[0].pattern),
    // hacky way for Regular expresions atm
    // See https://github.com/evanw/esbuild/issues/4019 for workaround source and feature request
    __UA_REGEX__: JSON.stringify(
        uaRegexp.toString().replace(/^\/|\/[dgimsuvy]*$/g, '')
    ),
    __UA_REGEX_FLAGS__: JSON.stringify(uaRegexp.flags),
    __MIN_SUPPORTED_BROWSERS__: Object.fromEntries(minSupportedBrowserVersions),
};

export const fileName = `better-moodle-${configFile}.user.js`;
const metaFileName = `better-moodle-${configFile}.meta.js`;

/**
 * Creates a unicode box as a multiline-js comment.
 * @param content - the full copyright text.
 * @returns a unicode box
 */
const copyrightBox = (content: string) =>
    boxen(content, {
        borderStyle: {
            topLeft: '/*!',
            topRight: '*',
            bottomLeft: ' *',
            bottomRight: '*/',
            top: '*',
            bottom: '*',
            left: '*',
            right: '*',
        },
        title: 'Copyright ©',
        padding: 1,
        width: Math.min(
            120, // The prettier max width for built file
            Math.max(...content.split(/\n/).map(l => l.length)) + 8 // Max line width + padding + border
        ),
    }).toString();

const copyrightContent = `
This is Better-Moodle; Version ${version}; Built for ${config.uniName} (${config.moodleUrl}).
Copyright (c) 2023-${new Date().getFullYear()} Jan (@jxn-30), Yorik (@YorikHansen) and contributors.
All rights reserved.
Licensed under the MIT License (MIT).
Source-Code: ${githubUrl}
`.trim();
const copyright = copyrightBox(copyrightContent);
const polyfillCopyrightContent = `
This is Polyfills for Better-Moodle; Version ${version}; Built for ${config.uniName} (${config.moodleUrl}).
Polyfills are provided by core-js@${devDependencies['core-js']}. Copyright (c) to the maintainers and contributors.
Better-Moodle Copyright (c) 2023-${new Date().getFullYear()} Jan (@jxn-30), Yorik (@YorikHansen) and contributors.
All rights reserved.
Licensed under the MIT License (MIT).
Source-Code: ${githubUrl}
`.trim();
const polyfillCopyright = copyrightBox(polyfillCopyrightContent);

/**
 * replaces unused i18n imports with a path to a file exporting empty translations
 * @param source - the path imported exactly as written in the import statement
 * @param importer - the path of the file importing the source
 * @returns undefined if the import should be resolved by the default resolver, otherwise the path to the file with empty translations
 */
const i18nResolver: ResolverFunction = (source, importer) => {
    // returning undefined will fall back to default resolver
    if (!importer) return undefined;

    const undefinedPath = 'src/i18n/undefined.ts';

    const sourcePath = path.relative(
        __dirname,
        path.resolve(path.dirname(importer), source)
    );
    const context = path.relative(__dirname, importer);

    if (/^src\/features\/.*\/i18n(\/index(\.ts)?)?$/.test(sourcePath)) {
        // Ah! We're trying to load index translations for this feature group!
        // hmm, is this feature group included?
        const featureGroup = sourcePath.split('/')[2];
        // if not, return the undefined path
        if (!allIncludedFeatureGroups.has(featureGroup)) {
            return undefinedPath;
        }
    }

    if (/^src\/features\/.*\/i18n\/index\.ts$/.test(context)) {
        // Ah! We're loading from a translation index file!

        // okay, if the translation file is not within an i18n folder, we must include
        // this is e.g. for the weather condition translations
        // maybe we can find a better way sometime
        if (!sourcePath.includes('i18n')) {
            return undefined;
        }

        // hmm, is this feature included?
        const featureGroup = context.split('/')[2];
        const feature = sourcePath.split('/')[4];
        // if not, return the undefined path
        if (!allIncludedFeatures.has(`${featureGroup}.${feature}`)) {
            return undefinedPath;
        }
    }

    // nothing special about the import, return undefined to fall back to default resolver
    return undefined;
};

const distPrettierConfig = await prettier.resolveConfig('dist');
/**
 * Runs prettier with dist config on a given source code
 * @param code - the source
 * @param path - the filename used to determine the parser
 * @returns a promise with the prettified source
 */
const distPrettier = (code: string, path: string) =>
    prettier.format(code, {
        ...distPrettierConfig,
        printWidth: 120,
        tabWidth: 2,
        filepath: path,
    });

const eslintDist = new ESLint({
    overrideConfigFile: 'eslint.userscript.config.js',
    fix: true,
});
/**
 * Runs ESLint with dist config on a given source code
 * @param code - the source
 * @param path - the filename used to determine the parser
 * @returns a promise with the linting result
 */
const distLint = (code: string, path: string) =>
    eslintDist.lintText(code, { filePath: path });

/**
 * Do Postbuild-Thingies on a file or sourceCode
 * @param path - the path of this file
 * @param source - the source code if not to be loaded from a file
 * @returns a promise with the modified source code
 */
const distPostBuild = async (path: string, source = '') => {
    const fileContent = source || (await fs.readFile(path, 'utf8'));
    const formatted = await distPrettier(fileContent, path);
    const [linted] = await distLint(formatted, path);
    const lintedCode = linted.output ?? linted.source ?? formatted;
    const formatted2 = await distPrettier(lintedCode, path);
    if (!source) await fs.writeFile(path, formatted2, 'utf8');
    return formatted2;
};

const modernTargets = browserslist.loadConfig({ path: process.cwd() });

export default defineConfig({
    esbuild: {
        jsxInject:
            'import {createElement, Fragment as createFragment} from "jsx-dom";',
        jsxFactory: 'createElement',
        jsxFragment: 'createFragment',
        jsx: 'transform',
        minifyWhitespace: true,
        minifyIdentifiers: false,
        minifySyntax: false,
    },
    build: {
        minify: 'esbuild',
        cssMinify: false,
        target: Array.from(
            new Set(
                resolveToEsbuildTarget(supportedBrowsers, {
                    printUnknownTargets: false,
                })
            )
        ),
    },
    resolve: {
        alias: [
            {
                find: /^@(?=\/)/,
                replacement: path.resolve(__dirname, './src/_lib'),
            },
            {
                find: /^#(?=\/)/,
                replacement: path.resolve(__dirname, './types'),
            },
            {
                find: /^i18n$/,
                replacement: path.resolve(__dirname, './src/i18n/i18n'),
            },
            {
                find: /^\+(?=\/)/,
                replacement: path.resolve(__dirname, './src/templates'),
            },
            {
                find: /^!(?=\/)/,
                replacement: path.resolve(__dirname, './src/style'),
            },
            ...(process.env.VITEST ?
                []
            :   [{ find: /^/, replacement: '', customResolver: i18nResolver }]),
        ],
    },
    css: {
        preprocessorOptions: {
            scss: {
                additionalData: '@use "global:constants.scss" as global;',
                importers: [
                    {
                        /**
                         * Urlifies the constants imports, otherwise forwards to standard importer
                         * @param url - the url to canonicalize
                         * @returns null or the urlified import
                         */
                        canonicalize(url: string) {
                            if (url === 'global:constants.scss') {
                                return new URL(url);
                            }
                            return null;
                        },
                        /**
                         * Creates a scss string with global constants
                         * @returns the contents with style
                         */
                        load() {
                            return {
                                contents: Object.entries(GLOBAL_CONSTANTS)
                                    .filter(([, value]) =>
                                        ['string', 'number'].includes(
                                            typeof value
                                        )
                                    )
                                    .map(
                                        ([name, value]) =>
                                            // we need to remove leading and trailing _, otherwise sass would make them private
                                            // https://sass-lang.com/documentation/at-rules/use/#private-members
                                            // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions
                                            `$${name.replace(/^_+|_+$/g, '')}: ${value};`
                                    )
                                    .join('\n'),
                                syntax: 'scss',
                            };
                        },
                    },
                ],
            },
        },
        modules: {
            scopeBehaviour: 'global',
            exportGlobals: false,
            hashPrefix: PREFIX,
            localsConvention: 'camelCaseOnly',
            /**
             * Generates a scoped class or id based on filename (feature)
             * @param name - the class or id that is to be scoped
             * @param filename - the filename this class or id lives in to extract the feature from
             * @returns the scoped class or id
             */
            generateScopedName: (name, filename) => {
                // extract feature name from filename
                const feat = path
                    .relative(__dirname, filename)
                    .replace(
                        /^src\/(style|features)\/|(\/?style|\/?index)?\.module\.(scss|sass)$/g,
                        ''
                    ) // extract feature name
                    .replace(/[^a-zA-Z0-9_-]/g, '-') // replace invalid characters with hyphen
                    .replace(/-+/g, '-'); // reduce multiple hyphens to a single one

                return `${PREFIX}_${feat}__${name.replace(/^_/, '')}`.replace(
                    /_{3,}/g,
                    '__'
                );
            },
        },
    },
    define: GLOBAL_CONSTANTS,
    plugins: [
        {
            name: 'import-fixes',
            transform: {
                filter: { code: 'import.meta.fixes()' },
                /**
                 * This transformer handles importing the fixes
                 * @param src - the source code which contains the import
                 * @returns the source code with fixes imports
                 */
                handler(src) {
                    return (
                        fastGlob
                            .sync(`.${fixesGlob}`)
                            .toSorted()
                            .map(
                                fix =>
                                    `import ${JSON.stringify(fix.replace(/^\./, ''))};`
                            )
                            .join('') +
                        src.replace(/import\.meta\.fixes\(\)/g, '')
                    );
                },
            },
        },
        {
            name: 'import-features',
            transform: {
                filter: {
                    code: {
                        include: [
                            'import.meta.featureGroups',
                            'import.meta.features',
                        ],
                    },
                },
                /**
                 * This transformer handles importing featureGroups and features
                 * @param src - the source code which contains the import
                 * @returns the source code with featureGroups and features imports and import object
                 */
                handler(src) {
                    const featureGroupIds = allIncludedFeatureGroups
                        .values()
                        .toArray()
                        .toSorted();
                    const featureGroupImports = featureGroupIds
                        .map(
                            group =>
                                `import { default as ${group} } from ${JSON.stringify(`${featuresBase}${group}`)};`
                        )
                        .join('');
                    const featureGroupObject = `{${featureGroupIds
                        .map(group => `${JSON.stringify(group)}: ${group},`)
                        .join('')}}`;
                    const featureIds = fastGlob
                        .sync(`.${featureGlob}`)
                        .map(f =>
                            f
                                .replace(`.${featuresBase}`, '')
                                .replace(/\//g, '_')
                                .replace(/\.tsx?$/g, '')
                        )
                        .toSorted();
                    const featureImports = featureIds
                        .map(
                            feat =>
                                `import { default as ${feat} } from ${JSON.stringify(featuresBase + feat.replace(/_/g, '/'))};`
                        )
                        .join('');
                    const featureObject = `{${featureIds.map(feat => `${JSON.stringify(feat)}: ${feat},`).join('')}}`;
                    const replaced =
                        featureGroupImports +
                        featureImports +
                        src
                            .replace(
                                /import\.meta\.featureGroups/g,
                                featureGroupObject
                            )
                            .replace(/import\.meta\.features/g, featureObject);
                    return replaced;
                },
            },
        },
        {
            name: 'mustache-loader',
            // TODO: Use the filter approach from import-features plugin
            /**
             * Minifies a mustache template a little.
             * @param src - the mustache template code
             * @param id - the import id of the template file
             * @returns null or the minified mustache template
             */
            transform(src, id) {
                if (!id.endsWith('.mustache?raw')) return null;
                return src
                    .replace(/\{\{!.*?\}\}/gs, '') // remove mustache comments
                    .replace(/\\n/g, '') // remove linebreaks
                    .replace(/(?<=\{\{[<>/$#^]?)\s+|\s+(?=\}\})/g, '') // remove unnecessary whitespaces in mustache statements
                    .replace(/(?<=<[a-z]+)\s+/g, ' ') // remove unnecessary whitespace in html tags (after tag name)
                    .replace(/(?<=")\s+(?=>)/g, '') // remove unnecessary whitespace in html tags (end of tag)
                    .replace(/\s+(?=\/>)/g, '') // remove unnecessary whitespace in self-closing html tags
                    .replace(/ {3,}/g, '  '); // reduce white spaces to a maximum of 2. This may break at <pre> tags but that isn't an issue yet.
            },
        },
        pluginTerser({
            module: true,
            compress: {
                defaults: false,
                collapse_vars: true,
                computed_props: true,
                dead_code: true,
                directives: true,
                evaluate: true,
                keep_classnames: true,
                keep_fnames: true,
                keep_infinity: true,
                lhs_constants: true,
                loops: true,
                passes: 5,
                properties: true,
                reduce_vars: true,
                side_effects: true,
                switches: true,
                typeofs: true,
                unused: true,
            },
            format: { comments: 'all', ecma: 2020 },
            mangle: false,
            ecma: 2020,
            keep_classnames: true,
            keep_fnames: true,
        }),
        legacy({
            modernTargets,
            modernPolyfills: true,
            renderLegacyChunks: false,
            renderModernChunks: true,
        }),
        {
            name: 'externalize-polyfill-chunk',
            apply: 'build',
            /**
             * Finds the polyfill-chunk, removes it from being further processed and writes it into a seperate file
             * @param _ - rollup output options, unused
             * @param bundle - an object containing all output assets and chunks
             */
            async generateBundle(_, bundle) {
                for (const [fileName, chunkOrAsset] of Object.entries(bundle)) {
                    if (
                        chunkOrAsset.type !== 'chunk' ||
                        !fileName.startsWith('polyfills-') ||
                        chunkOrAsset.name !== 'polyfills'
                    ) {
                        continue;
                    }

                    const outputFileName = `better-moodle-${configFile}-polyfills.js`;
                    // we need to make it an iife, otherwise global scope would be altered
                    // this would cause e.g. that Moodles global `M` would not be useable without using
                    // `unsafeWindow.M` as the core-js resource would have overwritten `M` in the userscripts scope.
                    const outputSrc = await distPostBuild(
                        outputFileName,
                        `${polyfillCopyright}\n(() => {${chunkOrAsset.code}})();`
                    );
                    addRequire(
                        `${githubUrl}/releases/download/${version}/${outputFileName}`,
                        isReleaseBuild ? outputSrc : false
                    );

                    this.emitFile({
                        type: 'asset',
                        fileName: outputFileName,
                        source: outputSrc,
                    });

                    delete bundle[fileName];
                }
            },
        },
        monkey({
            entry: 'src/core.tsx',
            userscript: {
                'name': `🎓️ ${config.uniName}: better-moodle`,
                'namespace': config.namespace,
                version,
                'author': [
                    'Jan (jxn_30)', // core contributor
                    'Yorik (YorikHansen)', // core contributor
                    ...(config.additionalAuthors ?? []),
                ].join(', '),
                'description': config.description,
                'homepage': `${githubUrl}${config.github.branch ? `/tree/${config.github.branch}` : ''}`,
                'homepageURL': `${githubUrl}${config.github.branch ? `/tree/${config.github.branch}` : ''}`,
                'icon': `https://icons.better-moodle.dev/${configFile}.png`,
                'updateURL': `${releaseDownloadUrl}/${metaFileName}`,
                'downloadURL': `${releaseDownloadUrl}/${fileName}`,
                'match': `${config.moodleUrl}/*`,
                'run-at': 'document-start',
                'connect': connects,
                'require': requires,
            },
            clientAlias: 'GM',
            build: { fileName, metaFileName, autoGrant: true },
            /**
             * Adds the copyright notice and a eslint global comment to the userscript
             * @param uOptions - information about the userscript, also containing the header
             * @returns the userscript header plus preamble
             */
            generate(uOptions) {
                // userscript header
                // copyright note
                // globals
                // allow redeclaring globals (otherwise polyfills may fail) => for the self-written code, this is already done via TS so it is okay to use this rule like this
                return `
${uOptions.userscript}

${copyright}

/* global global, globalThis, ActiveXObject, Iterator, M, requirejs, DarkReader */
/* eslint no-redeclare: ["error", { "builtinGlobals": false }] */
`.trim();
            },
        }),
        {
            name: 'Postbuild Prettier and ESLint',
            /**
             * Runs Prettier and ESLint on JS files in dist folder
             */
            async closeBundle() {
                void (await distPostBuild(path.resolve(`./dist/${fileName}`)));
            },
        },
        {
            name: 'Better-Moodle-build-stats',
            apply: 'build',
            /**
             * Hooks into roolup writeBundle, executed as the very last step
             * @param options - the output options
             */
            writeBundle(options) {
                const _PERF_TOTAL = process.hrtime.bigint() - _PERF_START;
                const _PERF_BUILD = _PERF_TOTAL - _PERF_CONFIG;

                const base = options.dir;
                if (!base) return;

                const prefix = '.stats_';

                const featuresFile = path.join(base, `${prefix}features.md`);
                const perfConfFile = path.join(base, `${prefix}perf_conf`);
                const perfBuildFile = path.join(base, `${prefix}perf_build`);
                const perfTotalFile = path.join(base, `${prefix}perf_total`);
                const polyfillsListFile = path.join(
                    base,
                    `${prefix}polyfills.md`
                );

                const timeConfig = {
                    minute: '2-digit',
                    second: '2-digit',
                    fractionalSecondDigits: 3,
                } as const;

                void Promise.all([
                    fs.writeFile(featuresFile, featureMd),
                    fs.writeFile(
                        perfConfFile,
                        new Date(
                            Number(_PERF_CONFIG / 1_000_000n)
                        ).toLocaleTimeString([], timeConfig)
                    ),
                    fs.writeFile(
                        perfBuildFile,
                        new Date(
                            Number(_PERF_BUILD / 1_000_000n)
                        ).toLocaleTimeString([], timeConfig)
                    ),
                    fs.writeFile(
                        perfTotalFile,
                        new Date(
                            Number(_PERF_TOTAL / 1_000_000n)
                        ).toLocaleTimeString([], timeConfig)
                    ),
                    fs
                        .readFile(path.join(base, fileName), 'utf8')
                        .then(userscript => {
                            const polyfillsSet = new Set<string>();
                            return detectPolyfills(
                                userscript,
                                modernTargets,
                                {},
                                polyfillsSet
                            ).then(() => polyfillsSet);
                        })
                        .then(polyfills =>
                            polyfills
                                .values()
                                .map(p => `* ${p}`)
                                .toArray()
                                .sort()
                                .join('\n')
                        )
                        .then(md => fs.writeFile(polyfillsListFile, md)),
                ]);
            },
        },
        // ...existing code...

        {
            name: 'chrome-extension-builder',
            apply: 'build',
            /**
             * Generates Chrome extension files from the userscript
             * @param options - the output options
             */
            async writeBundle(options) {
                if (!isChromeExtension) return;

                const base = options.dir;
                if (!base) return;

                const userscriptPath = path.join(base, fileName);
                const userscriptContent = await fs.readFile(userscriptPath, 'utf8');

                // Create extension directory
                const extDir = path.join(base, `chrome-ext-${configFile}`);
                await fs.mkdir(extDir, { recursive: true });

                // Map run-at values from userscript to Chrome extension
                const runAtMap: Record<string, 'document_start' | 'document_end' | 'document_idle'> = {
                    'document-start': 'document_start',
                    'document-end': 'document_end',
                    'document-idle': 'document_idle',
                };

                // Prepare content scripts array
                const contentScripts = [];
                
                // Add GM API shim first (before everything else)
                contentScripts.push('gm-shim.js');
                
                // Check if polyfills file exists and add it first
                const polyfillsFileName = `better-moodle-${configFile}-polyfills.js`;
                const polyfillsPath = path.join(base, polyfillsFileName);
                let hasPolyfills = false;
                try {
                    await fs.access(polyfillsPath);
                    hasPolyfills = true;
                    contentScripts.push('polyfills.js');
                } catch {
                    // Polyfills file doesn't exist
                }

                // Add requires if any (excluding polyfills which we handle separately)
                if (requires.length > 0) {
                    contentScripts.push('requires.js');
                }

                // Add main content script
                contentScripts.push('content.js');

                // Get description - handle both string and object formats
                const description = typeof config.description === 'string' 
                    ? config.description 
                    : (config.description)[''] ?? Object.values(config.description)[0] ?? '';

                // Generate manifest.json
                const manifest = {
                    manifest_version: 3,
                    name: `🎓️ ${config.uniName}: better-moodle`,
                    version,
                    description,
                    permissions: ['storage'],
                    host_permissions: [
                        `${config.moodleUrl}/*`,
                        ...connects.map(domain => `https://${domain}/*`)
                    ],
                    content_scripts: [{
                        matches: [`${config.moodleUrl}/*`],
                        js: ['injector.js'],
                        run_at: runAtMap['document-start'] || 'document_start',
                        all_frames: false
                    }],
                    web_accessible_resources: [{
                        resources: contentScripts,
                        matches: [`${config.moodleUrl}/*`]
                    }],
                    icons: {
                        128: 'icon.png'
                    }
                };

                await fs.writeFile(
                    path.join(extDir, 'manifest.json'),
                    JSON.stringify(manifest, null, 2)
                );

                // Create injector script that injects our scripts into the main page context
                const injector = `
// Injector: Injects scripts into the main page context and bridges storage
(function() {
    // Inject all scripts into main page context
    const scripts = ${JSON.stringify(contentScripts)};
    
    scripts.forEach(scriptName => {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL(scriptName);
        script.onload = () => script.remove();
        (document.head || document.documentElement).appendChild(script);
    });
    
    // Bridge storage between page and extension
    window.addEventListener('message', async (event) => {
        if (event.source !== window) return;
        
        const { type, key, value } = event.data;
        
        if (type === 'GM_STORAGE_REQUEST_INIT') {
            const items = await chrome.storage.local.get(null);
            window.postMessage({ type: 'GM_STORAGE_INIT', data: items }, '*');
        } else if (type === 'GM_STORAGE_SET') {
            await chrome.storage.local.set({ [key]: value });
        } else if (type === 'GM_STORAGE_DELETE') {
            await chrome.storage.local.remove(key);
        }
    });
    
    // Forward storage changes to page
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') {
            window.postMessage({ type: 'GM_STORAGE_CHANGED', data: changes }, '*');
        }
    });
})();
`.trim();
                await fs.writeFile(path.join(extDir, 'injector.js'), injector);

                // Copy polyfills file if it exists
                if (hasPolyfills) {
                    await fs.copyFile(
                        polyfillsPath,
                        path.join(extDir, 'polyfills.js')
                    );
                }

                // Create GM API shim for Chrome extension
                const gmShim = `
// GM API Shim for Chrome Extension
// This runs in the main page context (injected) and communicates with extension for storage

// Storage cache
window.__gmStorageCache = {};
window.__gmStorageReady = false;

// Message handler for storage responses
window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data.type?.startsWith('GM_STORAGE_')) return;
    
    const { type, data } = event.data;
    
    if (type === 'GM_STORAGE_INIT') {
        window.__gmStorageCache = data || {};
        window.__gmStorageReady = true;
        console.log('[GM Shim] Storage initialized with', Object.keys(data || {}).length, 'keys');
        window.dispatchEvent(new Event('__gmStorageReady'));
    } else if (type === 'GM_STORAGE_CHANGED') {
        Object.entries(data).forEach(([key, change]) => {
            if (change.newValue !== undefined) {
                window.__gmStorageCache[key] = change.newValue;
            } else {
                delete window.__gmStorageCache[key];
            }
        });
    }
});

// Request initial storage data
window.postMessage({ type: 'GM_STORAGE_REQUEST_INIT' }, '*');

const GM = {
    getValue: async (key, defaultValue) => {
        if (!window.__gmStorageReady) {
            await new Promise(resolve => {
                window.addEventListener('__gmStorageReady', resolve, { once: true });
            });
        }
        return window.__gmStorageCache[key] ?? defaultValue;
    },
    setValue: async (key, value) => {
        window.__gmStorageCache[key] = value;
        window.postMessage({ type: 'GM_STORAGE_SET', key, value }, '*');
    },
    deleteValue: async (key) => {
        delete window.__gmStorageCache[key];
        window.postMessage({ type: 'GM_STORAGE_DELETE', key }, '*');
    },
    listValues: async () => {
        if (!window.__gmStorageReady) {
            await new Promise(resolve => {
                window.addEventListener('__gmStorageReady', resolve, { once: true });
            });
        }
        return Object.keys(window.__gmStorageCache);
    },
    xmlHttpRequest: (details) => {
        // Use fetch instead of XHR to avoid CORS in main context
        return fetch(details.url, {
            method: details.method || 'GET',
            headers: details.headers,
            body: details.data,
            credentials: 'omit'
        }).then(response => {
            return response.text().then(text => {
                const result = {
                    status: response.status,
                    statusText: response.statusText,
                    responseText: text,
                    responseHeaders: Array.from(response.headers.entries())
                        .map(([k, v]) => \`\${k}: \${v}\`).join('\\n'),
                };
                if (details.onload) details.onload(result);
                return result;
            });
        }).catch(error => {
            const result = { status: 0, statusText: error.message };
            if (details.onerror) details.onerror(result);
            throw result;
        });
    },
    addStyle: (css) => {
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    },
    notification: (details) => {
        // Notifications require background script in MV3
        console.log('[GM Shim] Notification:', details.title, details.text);
    },
    info: {
        script: {
            name: "${config.uniName}: better-moodle",
            namespace: "${config.namespace}",
            version: "${version}",
        },
        scriptHandler: "Chrome Extension",
        version: "${version}",
    },
};

// Synchronous wrappers
const GM_getValue = (key, defaultValue) => {
    if (!window.__gmStorageReady) {
        console.warn('[GM Shim] GM_getValue called before storage ready, returning default for:', key);
        return defaultValue;
    }
    return window.__gmStorageCache[key] ?? defaultValue;
};

const GM_setValue = (key, value) => {
    window.__gmStorageCache[key] = value;
    window.postMessage({ type: 'GM_STORAGE_SET', key, value }, '*');
};

const GM_deleteValue = (key) => {
    delete window.__gmStorageCache[key];
    window.postMessage({ type: 'GM_STORAGE_DELETE', key }, '*');
};

const GM_listValues = () => {
    if (!window.__gmStorageReady) {
        console.warn('[GM Shim] GM_listValues called before storage ready, returning []');
        return [];
    }
    return Object.keys(window.__gmStorageCache);
};

const GM_xmlHttpRequest = (details) => GM.xmlHttpRequest(details);
const GM_addStyle = (css) => GM.addStyle(css);
const GM_notification = (details) => GM.notification(details);
const GM_info = GM.info;

const GM_addValueChangeListener = (key, callback) => {
    window.addEventListener('message', (event) => {
        if (event.source !== window || event.data.type !== 'GM_STORAGE_CHANGED') return;
        const change = event.data.data[key];
        if (change) {
            callback(key, change.oldValue, change.newValue, false);
        }
    });
};

const unsafeWindow = window;

console.log('[GM Shim] Loaded, waiting for storage...');
`.trim();

                await fs.writeFile(path.join(extDir, 'gm-shim.js'), gmShim);

                // Handle @require dependencies (excluding local polyfills)
                if (requires.length > 0) {
                    const requiresContent = await Promise.all(
                        requires.map(async (requireUrl) => {
                            const url = requireUrl.split('#')[0]; // Remove hash
                            
                            // Skip local polyfills file - we copied it separately
                            if (url.includes(polyfillsFileName)) {
                                return '';
                            }
                            
                            try {
                                const response = await fetch(url);
                                if (response.ok) {
                                    return `// ${url}\n${await response.text()}\n`;
                                }
                            } catch (error) {
                                console.warn(`Failed to fetch ${url}:`, error);
                            }
                            return `// Failed to fetch: ${url}\n`;
                        })
                    );
                    const filteredContent = requiresContent.filter(c => c !== '').join('\n');
                    if (filteredContent) {
                        await fs.writeFile(
                            path.join(extDir, 'requires.js'),
                            filteredContent
                        );
                    }
                }

                // Copy userscript as content.js (remove userscript metadata and wrap in async init)
                const contentJsRaw = userscriptContent.replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/m, '');
                const contentJsWrapped = `
// Wait for GM storage to be ready before executing main script
(async function() {
    // Wait for storage to initialize
    if (!window.__gmStorageReady) {
        console.log('[Content] Waiting for GM storage to be ready...');
        await new Promise(resolve => {
            if (window.__gmStorageReady) {
                resolve();
            } else {
                window.addEventListener('__gmStorageReady', resolve, { once: true });
            }
        });
        console.log('[Content] GM storage ready, executing main script');
    }
    
    // Execute main script
    ${contentJsRaw}
})();
`.trim();
                await fs.writeFile(path.join(extDir, 'content.js'), contentJsWrapped);

                // Download icon
                const iconUrl = `https://icons.better-moodle.dev/${configFile}.png`;
                try {
                    const iconResponse = await fetch(iconUrl);
                    if (iconResponse.ok) {
                        await fs.writeFile(
                            path.join(extDir, 'icon.png'),
                            Buffer.from(await iconResponse.arrayBuffer())
                        );
                    }
                } catch (error) {
                    console.warn(`Failed to fetch icon:`, error);
                }

                console.log(`Chrome extension built at: ${extDir}`);
            }
        },
    ],
});

const _PERF_CONFIG = process.hrtime.bigint() - _PERF_START;
