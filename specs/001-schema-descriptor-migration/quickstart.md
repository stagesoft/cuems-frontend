<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# Quickstart — validating this feature end to end

Runnable validation for the schema-descriptor migration. Shapes live in
[`data-model.md`](data-model.md), obligations in [`contracts/`](contracts/), the rule binding the
tests in [`contracts/characterization-rules.md`](contracts/characterization-rules.md).

**Nothing here is a substitute for the live checks in §4.** Three exit criteria — adopt/unadopt
against the real daemon, a project saving against the 001 editor, and the repair acknowledgement —
cannot be demonstrated by the unit suite.

---

## 0. Prerequisites

| | |
|---|---|
| This repository | `feat/xml-refactor`, with `feat/node-adoption-ui`'s four commits underneath |
| Producing end | `../cuems-editor` `feat/xml-refactor` (001, milestones 1 and 2), on `cuemsutils` `0.1.0rc16` @ `6213b16` |
| Local config | `src/app/core/config/app-config.json` (copy the `.example`, set `websocketBaseUrl`) |
| Browser for tests | Chrome — present at `/usr/bin/google-chrome` |

```bash
npm ci
git log --oneline origin/feat/node-adoption-ui..HEAD    # the tier must be underneath
```

---

## 1. Capture the fixtures that do not exist yet

Two must be captured and one derived before the port can be *measured*. Do this first; it gates
nothing else but is itself gated on nothing.

```bash
# post-001 project frame — a genuine to_wire() frame, not a derivation
cd ../cuems-editor
hatch run python specs/001-cuems-utils-migration/evidence/project-capture/capture_load.py \
    tests/fixtures/script_minimal_013.xml \
    > ../cuems-frontend/specs/001-schema-descriptor-migration/fixtures/project-013.frame.json

# the schema descriptor for the script schema
hatch run python -c "from cuemsutils.config import ConfigManager, SchemaName; import json; \
    print(json.dumps(ConfigManager().get_schema_descriptor(SchemaName.SCRIPT)))" \
    > ../cuems-frontend/specs/001-schema-descriptor-migration/fixtures/schema-descriptor-script.json
```

Record the library version and commit beside each, as the editor's own capture metadata does.
Derive the `node_list` fixture from the recorded mapping capture by the four deltas
`../cuems-editor/tests/test_node_merge.py` pins, and **commit the derivation script** next to the
output — not the output alone.

> The exact invocations above may need adjusting to the editor's environment. What must not be
> adjusted is the provenance: a fixture that cannot be traced to a recorded payload or a pinned
> derivation does not go in.

**Expected**: three fixture files, each with provenance recorded. The descriptor should show
`master_vol` default `100`, `dmx_channels` `null`, `opacity` `100`, and per-type instances
`script:AudioCueOutputsType` / `script:VideoCueOutputsType` whose scalars are all `null` — if the
instances now arrive wire-shaped instead, UR-1 has been answered and the transform is not needed.

---

## 2. Phase zero — the characterization gate

```bash
npm test -- --no-watch --browsers=ChromeHeadless
```

**Expected before the port**: green, with three spec files that did not exist before, covering the
project-edit sequence component, the projects service and the settings component. Verify the suite
actually exercises them rather than merely importing them — the enumerated surface is in
[`contracts/characterization-rules.md`](contracts/characterization-rules.md) and spec FR-003.

```bash
git log --format='%h %ad %s' --date=short -- src/app/**/*.spec.ts | head
```

**Expected**: the characterization commit is dated **before** the port commit. That ordering is exit
criterion 1 and is checkable by date.

**Expected after the port**: still green, with **no edited expectations** — only swapped input
fixtures, and only where the wire changed. The two sanctioned expectation changes (master volume
20 → 100, and `canAdopt` flipping once the booleans change) are named in the contract; anything else
is a finding to record, not a test to adjust.

---

## 3. Build

```bash
npm test -- --no-watch --browsers=ChromeHeadless && ng build
```

**Expected**: a clean production bundle in `dist/formitgo-tw/browser/`. Do not deploy from this
branch — nothing ships until the coordinated tag (D27).

---

## 4. Live validation against the 001 editor

Serve the UI (`ng serve`) against a running `cuems-editor` 001.

### 4.1 The round trip — the task that cannot be completed today

1. Open a project containing one audio, one video and one DMX cue, plus an action cue and a fade cue.
2. **Expected**: every cue shows its name, type and values. No cue blank, none dropped.
3. **Expected**: durations show timecodes in both the sequence list and the edit panel — including a
   media cue with no file selected, which is the operand that renders `[object Object]` today.
4. Edit a value and save.
5. **Expected**: the save succeeds with no error frame. Reload and confirm the change persisted.
6. Inspect the sent payload. **Expected**: hardware cues keyed `Cue` with `class`, outputs
   `CueOutput` with `class`, `enabled` a native boolean, and **no** `schemaLocation` key.

### 4.2 An unknown cue class

Open a project carrying a cue whose `class` this UI has no editor for.

**Expected**: it is listed and identified by its class, nothing errors, and saving preserves it
unchanged.

### 4.3 Creation from the descriptor

With the cache cleared, in an empty project add one cue of each type.

**Expected**: a new audio cue starts at master volume **100** — the operator-visible change. A new
DMX cue opens with **one** channel row. Audio and video cues arrive with complete, wire-shaped
outputs, pointed at the mapping document's default for their class and direction. Every cue saves.

### 4.4 The repair report and the save gate

1. Open a project the editor reports as `repaired` or `converted`.
2. **Expected**: the operator sees what changed, field by field, before editing anything, and
   "needs saving" when the file on disk differs from what was loaded.
3. Save without acknowledging. **Expected**: the refusal is explained in terms of the report and the
   acknowledgement is offered — not a bare error.
4. Acknowledge, then save. **Expected**: it succeeds.
5. Drop the connection (stop and restart the editor) with unsaved edits, then save. **Expected**: the
   save completes without re-asking about the same report, the operator is told the reconnection was
   handled, and no edit is lost.
6. Open a project the editor cannot load. **Expected**: the document, the named field, the library's
   message and **all three** next steps; the project stays listed and the session usable.

### 4.5 Adoption, against the real daemon

1. **Expected**: nodes and the daemon-availability flag come from the node list. The adopt control
   is **live** for a node discovery can see — it is dead for every node today.
2. **Expected**: discovery presence and sub-second liveness render as two separate indicators.
3. Adopt a discovered node, then un-adopt an adopted one. **Expected**: the daemon acts in both
   cases; a failure relays the daemon's own text.
4. **Expected**: un-adopting the controller is not offered.
5. **Expected**: each node's audio and video output lists are populated — these read the device
   collection and are three of the five sites the planning bundle does not list.
6. Introduce a duplicate node identity in `network_map.xml`. **Expected**: it is shown on the
   adoption screen, and clears when fixed.

### 4.6 Mixers and mapping reads

**Expected**: both mixers list every node and output the controller's map declares, including a node
carrying a `lighting` device, which is ignored without error. Every cue's output selector is
populated — the site whose failure blanks all of them.

### 4.7 The gate, demonstrated against a version other than 1

Point the UI at a peer announcing a different payload version, or one that announces none.

**Expected**: one screen naming both versions and what to do; **no** project, media, mixer or
configuration screen renders; the shell stays usable enough to read the message and change language.
Then start with an editor that sends no descriptor. **Expected**: the same gate, with the descriptor
named as the reason.

### 4.8 Cache eviction

Load the UI with a cache written before the upgrade (or with the stored version removed).

**Expected**: no screen renders from it, the retired template entry is gone, and the operator's
**language and panel position are unchanged**. Repeat with a *newer* stored version against an older
editor: it evicts too — eviction follows any difference, not only an older one.

Then read the keys back in the browser console: after eviction `localStorage` holds **no wire
payload at a bare key** — every payload lives under the reserved prefix, `userLanguage` and the
play-controls position do not. A payload surviving at a legacy key (`initial_mappings` is the one
that exists today) means T031a was missed and this check passed only by luck.

### 4.9 The read-only config views

**Expected**: each of the three config documents can be inspected in a view named for it; no view
offers a way to change a value; each states that editing is not yet available. No `config_save` is
sent — it would only earn an error frame.

What counts as passing for the **values** depends on what T103a settled. If a config read frame
exists, each view shows the controller's actual values and they match the documents on disk. If none
exists, each view shows the descriptor's field list and says plainly that the current values are not
yet available — and that half is recorded in `not-performed.md` with its report as the reason. A
view showing descriptor **defaults** as though they were the controller's values is a failure in
either case.

---

## 5. Recording

Before the candidate tag, confirm:

- every item that could not be performed is recorded **per entry** with its reason — including the
  config-save path, with UR-5 named;
- this repository's save-path dependency is registered against UR-5;
- UR-1 is filed for the descriptor instance shape, and the transform carries its identifier;
- the operator-visible changes are enumerated in one place for release (volume 100, the adopt
  control live again, no un-adopt for the controller, caches cleared but preferences kept, and the
  new refusal screens);
- the tag names `feat/node-adoption-ui` as included, as the editor's tag message does for its own
  siblings.

**Nothing releases from this branch alone** (D27).
