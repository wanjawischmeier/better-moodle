/**
 * Shared build logic for browser extensions
 * This script handles:
 * 1. Copying extension folder to dist (excluding build-scripts)
 * 2. Copying the built userscript to the dist extension's scripts folder
 * 3. Fetching external scripts from URLs
 * 4. Creating a zip file of the extension for browser loading
 */

import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    statSync,
    createWriteStream,
    writeFileSync,
} from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import archiver from 'archiver';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * List of external scripts to fetch and include in the extension
 * Format: { url: string, filename: string }
 */
const EXTERNAL_SCRIPTS = [
    {
        url: 'https://unpkg.com/darkreader@4.9.119/darkreader.js',
        filename: 'darkreader.js',
    },
];

/**
 * Build an extension for a specific platform
 * @param {string} platform - 'chromium' or 'firefox'
 */
export async function buildExtension(platform) {
    const rootDir = join(__dirname, '..');
    const extensionDir = join(__dirname, platform);
    const distDir = join(rootDir, 'dist');
    const distExtensionsDir = join(distDir, 'extensions');
    const distPlatformDir = join(distExtensionsDir, platform);

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Building ${platform} extension...`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // 1. Update manifest and polyfills
    console.log('Updating manifest.json from package.json...');
    execSync(`node extensions/${platform}/build-scripts/update-manifest.js`, {
        cwd: rootDir,
        stdio: 'inherit',
    });

    console.log('Updating polyfills from manifest.json...');
    execSync(`node extensions/${platform}/build-scripts/update-polyfills.js`, {
        cwd: rootDir,
        stdio: 'inherit',
    });

    // 2. Copy extension folder to dist (excluding build-scripts)
    console.log('Copying extension to dist...');

    // Create dist/extensions/platform directory
    mkdirSync(distPlatformDir, { recursive: true });

    // Copy all files except build-scripts
    const copyRecursive = (src, dest) => {
        const entries = readdirSync(src);

        for (const entry of entries) {
            if (entry === 'build-scripts') continue; // Skip build-scripts folder

            const srcPath = join(src, entry);
            const destPath = join(dest, entry);

            if (statSync(srcPath).isDirectory()) {
                mkdirSync(destPath, { recursive: true });
                copyRecursive(srcPath, destPath);
            } else {
                copyFileSync(srcPath, destPath);
            }
        }
    };

    copyRecursive(extensionDir, distPlatformDir);
    console.log(`Copied extension files to ${distPlatformDir}`);

    // 3. Inject URL mappings and supported URLs into copied files
    if (platform === 'chromium') {
        console.log('Injecting URL mappings and supported URLs...');
        const { injectUrlMapping, injectBackgroundUrls } = await import(
            `./${platform}/build-scripts/inject-universities.js`
        );

        injectUrlMapping(
            join(distPlatformDir, 'main.js'),
            join(distPlatformDir, 'main.js')
        );

        injectBackgroundUrls(
            join(distPlatformDir, 'background.js'),
            join(distPlatformDir, 'background.js')
        );
    }

    // 4. Copy all built userscripts to dist/extensions/platform/scripts
    console.log('Copying built userscripts...');
    const scriptsDir = join(distPlatformDir, 'scripts');
    mkdirSync(scriptsDir, { recursive: true });

    // Find all userscript files in dist
    const distFiles = readdirSync(distDir);
    const userscriptFiles = distFiles.filter(
        file => file.startsWith('better-moodle-') && file.endsWith('.user.js')
    );

    if (userscriptFiles.length === 0) {
        console.error(`Error: No built userscripts found in ${distDir}`);
        process.exit(1);
    }

    for (const userscriptFile of userscriptFiles) {
        const userscriptSrc = join(distDir, userscriptFile);
        const userscriptDest = join(scriptsDir, userscriptFile);
        copyFileSync(userscriptSrc, userscriptDest);
        console.log(`  Copied ${userscriptFile}`);
    }

    // 5. Fetch external scripts
    console.log('Fetching external scripts...');

    for (const script of EXTERNAL_SCRIPTS) {
        console.log(`  Fetching ${script.filename} from ${script.url}...`);
        await fetchAndSaveScript(script.url, join(scriptsDir, script.filename));
        console.log(`  Saved ${script.filename}`);
    }

    // 6. Create zip file
    console.log('Creating extension zip...');
    const packageJson = JSON.parse(
        readFileSync(join(rootDir, 'package.json'), 'utf-8')
    );
    const version = packageJson.version;
    const zipName = `better-moodle-${platform}-${version.replace(/\./g, '-')}.zip`;
    const zipPath = join(distPlatformDir, zipName);

    await createZip(distPlatformDir, zipPath, [zipName]); // Exclude the zip itself
    console.log(`Created ${zipName}`);

    console.log(`\n${platform} extension build complete!`);
}

/**
 * Fetch a script from a URL and save it to a file
 * @param {string} url - URL to fetch from
 * @param {string} outputPath - Path to save the file
 */
async function fetchAndSaveScript(url, outputPath) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(
            `Failed to fetch ${url}: ${response.status} ${response.statusText}`
        );
    }
    const content = await response.text();
    writeFileSync(outputPath, content, 'utf-8');
}

/**
 * Create a zip file from a directory
 * @param {string} sourceDir - Directory to zip
 * @param {string} outputPath - Path for the output zip file
 * @param {string[]} exclude - Files/folders to exclude
 */
function createZip(sourceDir, outputPath, exclude = []) {
    return new Promise((resolve, reject) => {
        const output = createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => resolve());
        archive.on('error', err => reject(err));

        archive.pipe(output);

        // Add all files from sourceDir, excluding specified items
        const entries = readdirSync(sourceDir);
        for (const entry of entries) {
            if (exclude.includes(entry)) continue;

            const fullPath = join(sourceDir, entry);
            const stat = statSync(fullPath);

            if (stat.isDirectory()) {
                archive.directory(fullPath, entry);
            } else {
                archive.file(fullPath, { name: entry });
            }
        }

        archive.finalize();
    });
}
