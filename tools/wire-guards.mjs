#!/usr/bin/env node
// Source sweeps that guard the wire contract. Run by `npm run test:ci` before
// Karma, because they read the source tree and a browser cannot.
//
// Each guard names the requirement it holds. A failure prints the offending
// lines and exits non-zero, so the gate is red, not a silent stale render.
//
// Sweeps cover *.ts AND *.html: an Angular template is where a payload read
// hides from a grep over *.ts.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(SRC).filter(f => /\.(ts|html)$/.test(f));
const rel = f => relative(ROOT, f).split(sep).join('/');
const isTest = f => /\.spec\.ts$/.test(f) || rel(f).startsWith('src/app/testing/');

const failures = [];
function check(name, offending) {
  if (offending.length) failures.push({ name, offending });
}

function lines(f) {
  return readFileSync(f, 'utf8').split('\n').map((text, i) => ({ file: rel(f), line: i + 1, text }));
}

// FR-071a / SC-009 (T031b): every wire payload is cached through PayloadCache,
// under the one reserved prefix the version gate evicts. The only localStorage
// uses allowed outside it are operator preferences, which must survive an
// upgrade: the language choice and the floating play-controls position.
const PREFERENCE = /userLanguage|STORAGE_KEY/;
check('localStorage outside PayloadCache holds only operator preferences (FR-071a)',
  files
    .filter(f => !isTest(f) && rel(f) !== 'src/app/core/payload-cache.ts')
    .flatMap(lines)
    .filter(l => /localStorage/.test(l.text) && !PREFERENCE.test(l.text)));

// T035: doc_version is the on-disk document marker. It is never on this wire
// and must not be introduced here, not even in a test.
check('doc_version appears nowhere in src/ (T035)',
  files.flatMap(lines).filter(l => /doc_version/.test(l.text)));

if (failures.length) {
  for (const { name, offending } of failures) {
    console.error(`\n✗ ${name}`);
    for (const l of offending) console.error(`  ${l.file}:${l.line}: ${l.text.trim()}`);
  }
  process.exit(1);
}
console.log(`wire-guards: ${files.length} files swept, all guards hold`);
