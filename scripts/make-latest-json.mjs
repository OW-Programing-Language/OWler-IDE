#!/usr/bin/env node
/**
 * Generate the `latest.json` update manifest the Tauri updater reads.
 *
 * Run AFTER a signed `tauri build` (TAURI_SIGNING_PRIVATE_KEY set). It reads the
 * NSIS installer's `.sig` file and emits a manifest pointing at the GitHub
 * release asset for the current version. Attach BOTH the setup.exe and this
 * latest.json to the GitHub release tagged `v<version>`.
 *
 * Usage:  node scripts/make-latest-json.mjs ["release notes"]
 */
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {join, resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const repo = 'OW-Programing-Language/OWler-IDE';
const version = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8')).version;
const notes = process.argv[2] || `Owler IDE v${version}`;

const nsisDir = join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
const setupName = `Owler IDE_${version}_x64-setup.exe`;
const sigPath = join(nsisDir, `${setupName}.sig`);
if (!existsSync(sigPath)) {
  console.error(`Missing signature: ${sigPath}\nRun a signed build first:\n  TAURI_SIGNING_PRIVATE_KEY=~/.owler-updater.key npm run tauri -- build`);
  process.exit(1);
}
const signature = readFileSync(sigPath, 'utf8').trim();
// GitHub replaces spaces in uploaded asset names with dots.
const assetName = setupName.replace(/ /g, '.');
const url = `https://github.com/${repo}/releases/download/v${version}/${assetName}`;

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {signature, url},
  },
};

const out = join(root, 'latest.json');
writeFileSync(out, JSON.stringify(manifest, null, 2));
console.log(`Wrote ${out}\n`);
console.log(JSON.stringify(manifest, null, 2));
console.log(`\nNext: create a GitHub release tagged v${version} and attach:`);
console.log(`  - ${join(nsisDir, setupName)}`);
console.log(`  - ${out}`);
console.log(`\n  gh release create v${version} "${join(nsisDir, setupName)}" "${out}" --title "Owler IDE v${version}" --notes ${JSON.stringify(notes)}`);
