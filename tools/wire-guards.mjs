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

// Project delta (c), T038–T044, T119: hardware cues travel as `Cue` + class
// and their outputs as `CueOutput` + class. A per-type wire key left in the
// source is a read or write of the retired shape, kept alongside the new one.
// Schema type names (script:AudioCueType, …OutputsType) are not wire keys.
check('no per-type cue wire keys (AudioCue, VideoCueOutput, …) outside specs (delta (c))',
  // design.component.html is the style-guide page: "AudioCue" there is sample
  // tooltip text, not a payload read.
  files.filter(f => !isTest(f) && rel(f) !== 'src/app/components/design/design.component.html')
    .flatMap(lines)
    .filter(l => /\b(Audio|Video|Dmx)Cue(Output)?\b/.test(l.text)));

// T108: the config views are read-only. config_save replaces a whole
// document and no read action exists (research R10, UR-2), so nothing in the
// app may send it until UR-2 is answered.
check('no config_save is sent from src/app (T108, UR-2)',
  files.filter(f => !isTest(f)).flatMap(lines)
    .filter(l => /config_save/.test(l.text) && !/^\s*(\*|\/\/)/.test(l.text)));

// T119: nothing of the retired wire is read alongside the new one —
// initial_template, node_type, the per-class default_* fields and the
// per-class node.audio / .video / .dmx blocks. Comments are allowed (they
// explain what was retired); payload-cache.ts names the retired bare keys it
// removes.
const RETIRED = /initial_template|projectTemplate|node_type|NodeType\.master|default_(audio|video|dmx)_(output|input)|\.node\??\.(audio|video|dmx)\b/;
check('no read of the retired wire beside the new one (T119)',
  files.filter(f => !isTest(f) && rel(f) !== 'src/app/core/payload-cache.ts').flatMap(lines)
    .filter(l => RETIRED.test(l.text) && !/^\s*(\*|\/\/|\/\*)/.test(l.text)));

if (failures.length) {
  for (const { name, offending } of failures) {
    console.error(`\n✗ ${name}`);
    for (const l of offending) console.error(`  ${l.file}:${l.line}: ${l.text.trim()}`);
  }
  process.exit(1);
}
console.log(`wire-guards: ${files.length} files swept, all guards hold`);
