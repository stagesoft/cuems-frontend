<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# The payload contract, from the consuming end

Vendored 2026-09-25 from `cuems-utils/specs/planning/xml-rebuild/xml-rebuild-05-ui-wire-contract.md`
and `specs/010-consumer-migration/contracts/editor-ui-messages.md`, amended per finding C3 and written
from **this** side of the wire.

`cuems-editor`'s copy of this contract is the producing end. Where a statement here and there differ,
they are describing the same two deltas from opposite sides — but the *consequences* differ, and this
file carries this repository's.

---

## 1. The contract

> The `project_load` payload is transmitted **verbatim** from `cuems-editor` to this repository, and it
> stays byte-identical to today's **except for exactly two already-landed, deliberate changes**:
>
> **(a)** `schemaLocation` is **absent**.
> **(b)** `Media.duration` is `{"CTimecode": "HH:MM:SS.mmm"}`, not a bare string.
>
> Everything else — **every other key, the ordering, and the string boolean form** — is unchanged.

**Not unconditional byte-equality.** That wording stood until 2026-09-03 and contradicts two of the
rebuild's own landed decisions (finding C3). Do not restate it.

**`doc_version` is not a third delta.** It is a document property, excluded from every wire projection.
Verified 2026-09-25: `grep -rn 'doc_version' src/` returns nothing, and it must stay that way.

---

## 2. What each delta does to code here

| Delta | Effect | Sites | Severity |
|---|---|---|---|
| (a) `schemaLocation` absent | `projects.service.ts:120`'s non-optional interface property describes a key that is not there. Nothing reads it, verified | one declaration, no template use | **cosmetic but not optional** — delete it, or the next reader concludes the field survives |
| (b) `Media.duration` wrapped | Two display sites render **`[object Object]`** where a timecode used to be | `project-show/sequence/sequence.component.ts:194` and `project-edit/sequence/sequence.component.html:134` | **an FR-030a-ii instance rendered to an operator** |

**Delta (b) does not fail loudly, and that is the point.** `cueData?.Media?.duration || '-'` does not
fall through to `'-'`, because the object is truthy. The cell shows `[object Object]`. Nothing throws,
nothing logs, and the suite is green — which is the failure class 007 FR-030a-ii names: the code keeps
resolving and the answer is wrong.

**The fix already exists in this repository**, on the fade path, both directions:

```
project-edit/sequence/sequence.component.ts:506   this.formatTimecode(cueData.duration?.CTimecode || '00:00:01.000')
project-edit/sequence/sequence.component.ts:980   newCue.duration = { CTimecode: this.ensureMilliseconds(...) }
```

Copy it. And note that `prewait`, `postwait` and `offset` are **already** unwrapped
(`project-show/sequence/sequence.component.ts:156`, `:166`;
`project-edit/sequence/sequence.component.ts:484-486`;
`project-edit/project-edit.component.ts:157-160`), so the shape is familiar here — which is exactly why
the two `Media.duration` sites were missed: they look like the only two that were left alone.

---

## 3. The string boolean form survives, and simplifying it is out of scope

```
project-edit/sequence/sequence.component.ts:492   enabled: cueData.enabled === true || cueData.enabled === 'True',
```

This dual read is **not** legacy debt for this feature to clean up. It is the compatibility mechanism
for a wire that still carries the string form, and the value is still written back as a string.
Changing it would be a **third delta** the contract does not sanction.

Upstream is explicit: the simplification **remains optional** — a follow-up, not a blocker. Keep it,
and say in the spec that keeping it is deliberate, so the next reader does not "finish the job".

---

## 4. The repair report — this repository is where it becomes visible or is lost

`cuems-editor` forwards 008's structured `LoadReport` as a WS message. **Rendering it is this
repository's job**, and `cuemsutils` deliberately cannot do this half: it has no UI channel and must not
gain one.

The report answers, from data alone and never `None` in place of an empty report:

- which document;
- which fields were repaired, and **to what**;
- which conversions ran;
- **whether the file on disk is now stale**.

That last flag is load-bearing for the UX here. Because a load never writes a repaired document back
(D21's settled behaviour — a load stays a read), an unsaved document is **repaired identically on every
open and reports the same repair each time**. Without the stale flag surfaced, that reads as a bug. With
it, it reads as "this file needs saving".

**And the failure case needs a next step.** When a document is unrepairable, the editor sends a
structured failure naming the document and the failing field, on the same channel. The project stays
listed and the session survives; only that document refuses to open. The operator's three recovery
actions are: restore from a conversion backup, correct the named field by hand, or remove the document
from the library. A message that says only *"this will not open"* leaves a broken project and nowhere to
go — upstream made that an explicit requirement rather than a nicety.

---

## 5. The domain entanglement, and why three components move together

`cuems-editor`'s `reload_network_map_nodes` merges `network_map` node status **into** `mappings_dict` and
serves the result as `initial_mappings`. So a `network_map` edit reaches this UI **inside a
`project_mappings` payload** — two config domains on one wire key.

Three consumers here:

```
components/settings/settings.component.ts:48, :56         projectsService.initialMappings()
components/projects/project-show/audio-mixer/audio-mixer.component.ts:80   localStorage 'initial_mappings'
components/projects/project-show/video-mixer/video-mixer.component.ts:94   localStorage 'initial_mappings'
```

`cuems-editor` untangles the producing side; this flow moves the three consumers. **They land together.**
Neither half is shippable alone, and this is not a sequencing preference — an untangled editor serving a
UI that still expects the merged shape shows an operator the wrong node list on a screen they use to
adopt hardware.

**Two of the three read `localStorage` directly**, bypassing the service. `localStorage` is a cache that
survives an upgrade, so the untangling needs an **eviction story** — a version key, a clear on connect,
or a migration — not just a new payload shape. A cache that outlives a schema change is how a UI shows
the wrong shape after everything else was done correctly.

---

## 6. The handshake — this repository's only gate

This repository is **not packaged**, so it cannot carry a `debian/` relation and upstream's release-gate
mechanism (FR-091) does not reach it. Upstream's answer (FR-108) is a **runtime payload-version
handshake**: the editor advertises a payload version when a client connects, and a UI that does not
understand it **refuses and says so** rather than rendering a wrapped duration as an object.

§2's `[object Object]` is precisely what "rendering a wrapped duration as an object" looks like. The
handshake exists so that an operator sees a clear refusal instead of a table of garbage — which means
**the refusal path needs a design here**, not just a version check: what the operator sees, and what
they are told to do about it.

Keep the two numbers apart wherever either appears:

| | What | Lives |
|---|---|---|
| **payload version** | the editor ↔ UI handshake | on the wire, this feature adds it |
| **`doc_version`** | the on-disk document marker | never on the wire, never here |

Merging them is a recorded hazard, called out upstream in three separate documents.
