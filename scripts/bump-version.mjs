#!/usr/bin/env node
// Keeps the app version identical in every file that stores it.
//
//   node scripts/bump-version.mjs            -> next patch, keeps the pre-release tag
//                                               (1.0.4-pre-alpha -> 1.0.5-pre-alpha)
//   node scripts/bump-version.mjs 1.1.0-alpha -> set an exact version
//   node scripts/bump-version.mjs --check    -> exit 1 if the files disagree (used in CI)
//
// See docs/VERSIONING.md for the rules.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = (p) => join(root, p);

// Strict semver: MAJOR.MINOR.PATCH with an optional pre-release tag.
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

function readJson(file) {
  return JSON.parse(readFileSync(path(file), 'utf8'));
}
function writeJson(file, data) {
  writeFileSync(path(file), JSON.stringify(data, null, 2) + '\n');
}

const CARGO_VERSION = /^(\[package\][^[]*?\nversion\s*=\s*")([^"]+)(")/m;

function readVersions() {
  const versions = {
    'package.json': readJson('package.json').version,
    'src-tauri/tauri.conf.json': readJson('src-tauri/tauri.conf.json').version,
    'src-tauri/Cargo.toml': readFileSync(path('src-tauri/Cargo.toml'), 'utf8').match(CARGO_VERSION)?.[2],
  };
  if (existsSync(path('package-lock.json'))) {
    versions['package-lock.json'] = readJson('package-lock.json').version;
  }
  return versions;
}

function nextPatch(version) {
  const m = version.match(SEMVER);
  if (!m) throw new Error(`Current version "${version}" is not valid semver`);
  const [, major, minor, patch, pre] = m;
  // 1.0.0-pre-alpha is the first build; every later commit is the next patch with the same tag.
  return `${major}.${minor}.${Number(patch) + 1}${pre ? `-${pre}` : ''}`;
}

function setVersion(version) {
  const pkg = readJson('package.json');
  pkg.version = version;
  writeJson('package.json', pkg);

  if (existsSync(path('package-lock.json'))) {
    const lock = readJson('package-lock.json');
    lock.version = version;
    if (lock.packages?.['']) lock.packages[''].version = version;
    writeJson('package-lock.json', lock);
  }

  const conf = readJson('src-tauri/tauri.conf.json');
  conf.version = version;
  writeJson('src-tauri/tauri.conf.json', conf);

  const cargoPath = path('src-tauri/Cargo.toml');
  const cargo = readFileSync(cargoPath, 'utf8');
  if (!CARGO_VERSION.test(cargo)) throw new Error('Could not find [package] version in Cargo.toml');
  writeFileSync(cargoPath, cargo.replace(CARGO_VERSION, `$1${version}$3`));

  // Cargo.lock also records our own crate's version; keep it in sync so CI doesn't see a diff.
  const lockPath = path('src-tauri/Cargo.lock');
  if (existsSync(lockPath)) {
    const lock = readFileSync(lockPath, 'utf8');
    writeFileSync(
      lockPath,
      lock.replace(/(\[\[package\]\]\nname = "pdf-studio"\nversion = ")[^"]+(")/, `$1${version}$2`),
    );
  }
}

const arg = process.argv[2];
const versions = readVersions();
const values = new Set(Object.values(versions));

if (arg === '--check') {
  if (values.size !== 1) {
    console.error('Version mismatch:', versions);
    process.exit(1);
  }
  console.log(`Versions agree: ${[...values][0]}`);
  process.exit(0);
}

if (values.size !== 1) {
  console.error('Versions disagree before bumping, fix them first:', versions);
  process.exit(1);
}

const current = versions['package.json'];
const target = arg ?? nextPatch(current);
if (!SEMVER.test(target)) {
  console.error(`"${target}" is not valid semver (expected e.g. 1.0.5-pre-alpha)`);
  process.exit(1);
}
setVersion(target);
console.log(`${current} -> ${target}`);
