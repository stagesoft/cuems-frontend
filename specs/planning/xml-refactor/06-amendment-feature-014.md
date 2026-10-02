<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# Amendment 2 to this bundle — `cuems-utils` feature 014 moves booleans to `xs:boolean`

**Status**: **not yet applied** to `00`–`04`. This file is the authority for everything in it, and
the two sections it supersedes carry a pointer to it. Applying it is part of this feature's
specification pass.

**Why it exists**: `cuems-utils` feature **014** retypes `cms:BoolType` to the standard
`xs:boolean`, so the wire stops carrying `"True"` / `"False"` and starts carrying JSON `true` /
`false`. The upstream gate document deliberately holds **no frontend work** — all of it is unloaded
here, which is what this amendment is.

**Upstream source**: `../cuems-utils/specs/planning/coordinated-gate-booleans-media-dimensions.md`
(feature 014's plan; accepted, all eight decisions settled) and
`../cuems-utils/specs/planning/booltype-silent-false-coercion-defect.md` §6–§7.

**Measured** 2026-10-02 against this branch @ `8a61780`, `../cuems-editor` `bf57d95`, and
`../cuems-utils` `fdfb688` (`0.1.0rc16`).

> ### What this supersedes, in one line each
>
> - **`04-wire-contract.md` §4** — *"The string boolean form survives, and simplifying it is out of
>   scope … **Keep it**"*. The string form **does not survive**. §1 below.
> - **`03-migration-inventory.md` §4a item 2** — *"Use the same dual read the cue code uses
>   (`=== true || === 'True'`)"* for `settings.component.ts:176`. After 014 that line is **already
>   correct as written** and needs no edit. §2 below.
>
> Both were right when they were written, against a wire that carried strings. Neither is wrong
> about the *mechanism*; both are now wrong about the *direction*.

---

## 1. The one line that is a hard coupling: `sequence.component.ts:997`

```ts
src/app/components/projects/project-edit/sequence/sequence.component.ts:997
    newCue.enabled = cue.enabled ? 'True' : 'False';
```

**After feature 014 this breaks saving, and it is the only line in this repository that does.**

The reason is not that the string looks wrong. It is that `cuems-utils` validates an inbound
payload *through its adapter*, and that adapter becomes strict about the spelling. Measured today on
`0.1.0rc16` @ `fdfb688`, after the library's `be3e86e`:

| the frontend sends | `_Bool.decode` today | after 014 |
|---|---|---|
| `true` / `false` (JSON) | accepted | **accepted** |
| `'True'` / `'False'` | accepted | **refused** — `cms:BoolType` will accept `true`, `false`, `1`, `0` or a `bool` |
| `'true'` / `'1'` / anything else | **already refused** (`cms:BoolType accepts 'True', 'False' or a bool`) | refused |

The refusal is not silent and not cosmetic. `CuemsScript.from_json` has no document to validate
against, so **the adapter is the whole of its structural check**; a refusal becomes a `SchemaError`,
and `cuems-editor`'s save path surfaces it as a failed save. A sequence saved by a frontend that
still writes `'True'` does not save at all.

### The fix, and why this repository's own code already proves it

```ts
-   newCue.enabled = cue.enabled ? 'True' : 'False';
+   newCue.enabled = cue.enabled;          // already a boolean in the UI model
```

**This repository already writes native booleans for the same field.** The CueList fallback at
`sequence.component.ts:882-897` builds:

```ts
autoload: false,
enabled: true,
timecode: false,
```

So `CueList.enabled` leaves as JSON `true` while a *cue's* `enabled` leaves as `'True'` — two
spellings of one field, in one file, today. Both are accepted by the current library; only the
string one breaks after 014. The native form is not a new idea here, it is the one already in use
three lines of code away.

### `autoload` and `timecode` need no work at all

Measured: they are **written** native (`:884`, `:895`, and `project-edit.component.ts:158`, `:169`)
and **never read** from the wire anywhere in `src/app/`. They are correct before 014 and correct
after it. Do not add them to the task list.

---

## 2. `settings.component.ts:176` — do not add the dual read; it becomes correct by itself

```ts
settings/settings.component.ts:176
    return nodeWrapper?.node?.online === true;
```

`03-migration-inventory.md` §4a item 2 says to make this a dual read. **Do not**, if this
repository ships with or after feature 014 — which the coordinated `xml-refactor-merge-candidate`
tag enforces, since 014 is inside the 011–015 set.

| | `online` on the wire | `=== true` evaluates |
|---|---|---|
| today (editor 001 landed, 014 not) | `"True"` | **false, always** |
| after 014 | `true` | **correct** |

**What is broken today is worse than the badge.** `isSeenByDiscovery()` is permanently false, and
`canAdopt()` at `:187` is `nodeconfAvailable() && isSeenByDiscovery(...)` — so **the Adopt button is
dead for every node**, not merely mis-coloured. That is worth knowing because it changes how the
item is triaged: it is a dead control in a screen in daily use on the controller, not a cosmetic
defect.

**The decision this leaves open, and it is a scheduling one, not a design one:**

- **Ship with or after 014** → change nothing at `:176`. It starts working.
- **Ship before 014** → the dual read `=== true || === 'True'` is the correct transitional form
  (it is right on both sides of the change), and it can then be simplified back. §4a's advice
  stands *only* in this branch of the decision.

Either way, **add a characterization test for `canAdopt()` first** (D35): it is the assertion that
tells the two cases apart, and without it "the Adopt button works again" is an impression.

### `:182` — the stale `node_type`, which 014 does not fix

```ts
settings/settings.component.ts:182   (in canUnadopt(), :180)
    && nodeWrapper?.node?.node_type !== 'NodeType.master';
```

`cuems-utils` feature **007** renamed that element to `node_role`, with values
`controller` / `node` / `firstrun`. The key is absent, so `undefined !== 'NodeType.master'` is
**always true** and `canUnadopt()` is permanently *enabled* — including for the controller, which
`cuems-nodeconf` then refuses. Textbook 007 FR-030a-ii, "keeps resolving but becomes wrong".

It is **independent of 014** and live on `main`-line behaviour. It is in this amendment only
because anyone editing `:176` is already in the file. Fix: `node_role !== 'controller'`.

### There is no `adopted` read to change

`03-migration-inventory.md` asks, for `settings.component.ts`, to *"check the adjacent `adopted`
read in the same file"*. Answered by measurement: **there is none.** The only `.online` / `.adopted`
reads in the whole of `src/app/` are `settings.component.ts:176` and an unrelated `onlineUsers`
setter at `layout/app-footer/app-footer.component.ts:56`. The item closes on one site.

---

## 3. `sequence.component.ts:498` — the dual read's reason is gone

```ts
    enabled: cueData.enabled === true || cueData.enabled === 'True',
```

`04-wire-contract.md` §4 calls this *"the compatibility mechanism"*. It is worth recording what it
was compatible **with**, because that thing no longer exists.

The upstream audit's finding **F21** (severity HIGH, measured) was that `cuems-editor` sent the UI
**two mutually inconsistent JSON encodings of the same document**: `initial_template` through
`__json__` (Python types, so native booleans) and `project_load` through the converter (schema
types, so strings). This dual read is what absorbed the difference. Both halves are now closed:

- `cuems-utils` feature **006** retired the eight `__json__` methods into one derived projection.
  Verified: `ConfigManager.generate_example(SchemaName.SCRIPT)` emits `"enabled": "True"` — the
  *string*, identical to `to_wire`. One encoding, not two.
- `cuems-editor` **T060** retired `initial_template` entirely at payload version 1; a client builds
  from `schema_descriptor("script")`'s `instance`.

So the `=== true` half is dead code today and the `=== 'True'` half is dead code after 014. **Drop
the `=== 'True'` half** when 014 lands; `enabled: cueData.enabled === true` is then exact.

This is not urgent and nothing breaks if it is left — the dual read is correct on both sides. It is
listed so the spec can retire it deliberately rather than leaving a line whose comment explains a
defect that was fixed two features ago.

---

## 4. The `localStorage` eviction — **this repository owns it** (upstream decision 7)

`03-migration-inventory.md` §4 already names the hazard: *"`localStorage` is a cache that outlives a
schema change … The untangling needs an eviction story."* It had no owner. **It does now, and it is
this repository.**

The reasoning, recorded upstream and repeated here because it is the part that decides the design:
all four cache sites are this repository's own files, `localStorage` is reachable from **nowhere
else**, and `cuems-editor` can only *advertise* a version — a server cannot clear another origin's
storage. The editor's half already exists: it sends `payload_version` as the **first frame on
connect** (its T057).

| Site | What it caches |
|---|---|
| `services/projects/projects.service.ts:209` | `initial_template` — and it is **never refreshed** |
| `services/projects/projects.service.ts:217` | `initial_mappings` |
| `components/projects/project-show/video-mixer/video-mixer.component.ts:94` | reads cached `initial_mappings` directly |
| `components/projects/project-show/audio-mixer/audio-mixer.component.ts:115` | reads cached `initial_mappings` directly |

**The mechanism**: store the `payload_version` alongside the cache; on connect, compare it with the
received one and clear every cached payload if they differ. Three properties the spec should state,
because each is a way to get it wrong:

1. **Evict on *any* difference, not only on "older".** A downgrade — an operator rolling the editor
   back — leaves a *newer* cache against an older server, which is the same hazard.
2. **A missing stored version counts as a difference.** Every browser in the field today has a
   cache and no version beside it; that is precisely the population this has to clear.
3. **`initial_template` is retired at payload version 1**, so its cache entry is not migrated — it
   is *deleted*, and the code that reads it goes with it. A cache entry for a frame the server no
   longer sends can never be refreshed and will never expire on its own.

**Why it matters here specifically**: after 014 a cached payload holds the *old boolean form*. A
mixer that reads it (`node?.audio` filters at `audio-mixer:129`, `video-mixer:107`) is reading a
shape no server will ever send again. This is the one hazard in the whole gate that no change on
the server side can reach.

---

## 5. Media pixel dimensions — nothing to do, and that is measured

Feature 014 also adds three optional elements to `MediaType` (`pixel_width`, `pixel_height`,
`file_size`), from
`../cuems-utils/specs/planning/media-pixel-dimensions-for-xml-refactor.md`.

**This repository needs no change**, and its own §4 says why: the frontend rebuilds `Media` as
`{file_name, id, duration, regions}` on save and ignores unknown keys on load; `cuems-editor` adds
the values server-side, after the frontend has built the dict. Recorded here so the spec does not
budget for it.

One adjacent item from that plan, unrelated to 014 and worth carrying: this branch still sends
`duration: '00:00:00.000'` in `Media`, which predates `main`'s media-duration fix. The editor's
save-time fill corrects it, so nothing is broken — but merging `main` would remove the difference.

---

## 6. The whole of feature 014's frontend work, as a task list

Five items, in the order the dependencies imply. This is the unloaded gate, complete.

| # | Item | Coupling to 014 | Size |
|---|---|---|---|
| 1 | Characterization tests for `sequence.component.ts`'s save path and `settings.component.ts`'s `canAdopt()` / `canUnadopt()` | **before everything** (D35, finding C8) | the real work |
| 2 | `sequence.component.ts:997` → write the native boolean | **hard and simultaneous** — saving fails otherwise (§1) | one line |
| 3 | `settings.component.ts:176` → leave alone if shipping with 014; dual read only if shipping before (§2) | scheduling | zero or one line |
| 4 | `settings.component.ts:182` → `node_role !== 'controller'` | **none** — a 007 defect, shippable now (§2) | one line |
| 5 | `localStorage` eviction keyed on `payload_version` (§4) | same release as payload version 1 | a small service change plus the `initial_template` deletion |

**Items 4 and 5 can ship ahead of 014. Item 2 cannot ship without it, and 014 cannot ship without
item 2** — that pair is the only genuine simultaneity this amendment adds to `00-runnable-flow.md`
§6's list.

**What is *not* on this list, each because it was measured and found unnecessary**: `autoload` and
`timecode` (§1), any `adopted` read (§2), anything for media pixel dimensions (§5), and any change
to the OSC path — `osc.service.ts:191` and `:361` carry cue-enabled as `1` / `0` over OSC
(`Number(msg.args[0]) === 1`), a different transport with its own encoding, correct as it is and
**not** to be unified with this.

---

## 7. Why the string form is going away at all — the short version

Not for tidiness. Recorded here so the spec can state a reason rather than citing an upstream
decision:

- **`cms:BoolType` was an `xs:string` enum of `True` / `False`**, which made it the only type in the
  schema whose wire form was not its natural JSON form. Every other type — ints, floats, uuids,
  enums, the `CTimecode` wrapper — already projects natively.
- **The schema descriptor could not tell a boolean from a two-value string enum.** `enabled` came
  back as `enum_values: ('True', 'False')`, structurally identical to `post_go`'s three values. Any
  descriptor-driven form — which is what this feature builds — would render **a two-option dropdown
  where a checkbox belongs**, for all five boolean fields, and feature 010's T031a would have
  verified that as correct. This is the argument that decided it, and it is a *frontend* argument.
- **The compatibility mechanism was honoured at one of two sites.** The cue read had the dual form;
  the `online` read never did, and the cost was a dead Adopt button.
