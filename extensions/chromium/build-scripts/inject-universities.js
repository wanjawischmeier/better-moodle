/**
 * Scans the configs folder and generates a list of supported universities
 * Injects this list into the popup.js file
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..', '..', '..');
const configsDir = join(rootDir, 'configs');

/**
 * Scan configs folder and extract university information
 */
export function getUniversities() {
    const files = readdirSync(configsDir);
    const universities = [];

    for (const file of files) {
        // Skip files that start with dot or underscore, and non-JSON files
        if (
            file.startsWith('.') ||
            file.startsWith('_') ||
            !file.endsWith('.json')
        ) {
            continue;
        }

        try {
            const configPath = join(configsDir, file);
            const config = JSON.parse(readFileSync(configPath, 'utf-8'));

            if (config.uniName && config.moodleUrl) {
                const configName = file.replace('.json', '');
                universities.push({
                    name: config.uniName,
                    scriptName: `better-moodle-${configName}.user.js`,
                    configName: configName,
                    moodleUrl: config.moodleUrl,
                });
            }
        } catch (error) {
            console.warn(
                `Warning: Could not parse config file ${file}:`,
                error.message
            );
        }
    }

    return universities;
}

/**
 * Inject URL mapping into main.js template
 */
export function injectUrlMapping(templatePath, outputPath) {
    const universities = getUniversities();
    const template = readFileSync(templatePath, 'utf-8');

    // Create a mapping of URL patterns to script names
    const urlMapping = {};
    universities.forEach(uni => {
        urlMapping[uni.moodleUrl] = uni.scriptName;
    });

    // Replace the placeholder with the actual mapping
    const output = template.replace(
        "'URL_MAPPING_PLACEHOLDER'",
        JSON.stringify(urlMapping, null, 4)
    );

    writeFileSync(outputPath, output, 'utf-8');
    console.log(`  Injected ${universities.length} URL mappings into main.js`);
}

/**
 * Get all moodle URLs for manifest permissions
 */
export function getAllMoodleUrls() {
    const universities = getUniversities();
    return universities.map(uni => `${uni.moodleUrl}/*`);
}

/**
 * Inject supported URLs into background.js template
 */
export function injectBackgroundUrls(templatePath, outputPath) {
    const urls = getAllMoodleUrls();
    const template = readFileSync(templatePath, 'utf-8');

    // Replace the placeholder with the actual URLs array
    const output = template.replace(
        "'SUPPORTED_URLS_PLACEHOLDER'",
        JSON.stringify(urls, null, 4)
    );

    writeFileSync(outputPath, output, 'utf-8');
    console.log(`  Injected ${urls.length} supported URLs into background.js`);
}
