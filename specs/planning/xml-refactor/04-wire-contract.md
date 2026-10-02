<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# The payload contract, from the consuming end

Vendored 2026-09-25 from `cuems-utils/specs/planning/xml-rebuild/xml-rebuild-05-ui-wire-contract.md`
and `specs/010-consumer-migration/contracts/editor-ui-messages.md`, amended per finding C3. **Rewritten
2026-10-02** after `cuems-utils` 013 (device-class reshape, `6213b16`) completed and `cuems-editor` 001
was implemented, milestone 2 included (`cuems-editor` `feat/xml-refactor` @ `8247e9b`). Record of what
changed: `05-amendment-2026-10-02.md`.

The producing end's authoritative list of frames is `../cuems-editor/tests/ws-command-responses.txt`.
This file carries the consequences **here**.

---

## 1. The contract

Two things changed at once, and they are different kinds of change:

- the **`project` frame** differs from the pre-001 frame by **four enumerated deltas** (§2);
- the **connection** carries a payload version first, and several frames are new, split or retired
  (§4–§7). Those changes are what payload version 1 means.

Everything not listed — every other key of the `project` value, the key order, and the **string boolean
form** `"True"` / `"False"` — is unchanged. *(The boolean form is unchanged by editor 001 and
**changes in `cuems-utils` 014** — see §4's supersession note and
[`06-amendment-feature-014.md`](06-amendment-feature-014.md).)*

**Not unconditional byte-equality.** That wording stood until 2026-09-03 and contradicted the
rebuild's own landed decisions (finding C3). Do not restate it, and do not restate "exactly two deltas"
either: that held until 013 landed.

**`doc_version` is not a delta.** It is a document property, excluded from every wire projection.
Verified 2026-10-02: `grep -rn 'doc_version' src/` returns nothing, and it must stay that way.

---

## 2. The `project` frame (reply to `project_load`) — four deltas

| Delta | Change | Effect here | Sites |
|---|---|---|---|
| **(a)** | `schemaLocation` absent | `projects.service.ts:146`'s non-optional property describes a key that is not there. Nothing reads it | one declaration — **delete it** |
| **(b)** | `Media.duration` is `{"CTimecode": "HH:MM:SS.mmm"}` | **`[object Object]`** where a timecode used to be | `project-show/sequence/sequence.component.ts:197`; `project-edit/sequence/sequence.component.ts:1256` (rendered by `.html:134`) |
| **(c)** | **013**: a hardware cue is `{"Cue": {..., "class": "audio"\|"video"\|"dmx"\|<any string>}}`; a hardware cue output is `{"CueOutput": {..., "class": ...}}`. `ActionCue`, `FadeCue`, `CueList` keep their keys and carry no `class` | every read keyed `AudioCue` / `VideoCue` / `DmxCue` / `*CueOutput` finds nothing, **and saving fails** (§3) | `03-migration-inventory.md` §2d |
| **(d)** | a video cue whose document has no `<opacity>` carries `"opacity": 100`, the `VideoCue` default (sanctioned 2026-10-02) | a value appears where none was | only matters if something treats presence as "set by the operator" |

**Delta (b) does not fail loudly, and that is the point.** `… || '-'` does not fall through, because
the object is truthy. Nothing throws, nothing logs, the suite is green. The fix already exists here, on
the fade path: `project-edit/sequence/sequence.component.ts:519` (read, `duration?.CTimecode`) and
`:1024` (write, `{ CTimecode: ... }`). `prewait`, `postwait` and `offset` are already unwrapped
(`project-show/sequence/sequence.component.ts:156`, `:166`; `project-edit/project-edit.component.ts`).

**Delta (c) is open-vocabulary.** `class` is `"audio"`, `"video"`, `"dmx"` or any other string; a class
this UI has never seen must not be an error. Internal vocabulary (TypeScript unions, icons, i18n keys,
routes) may keep the words "audio", "video", "dmx" — they are not wire keys.

---

## 3. Inbound: what the editor accepts on `project_save` / `project_new`

The client sends the same shape back. Measured against the 001 editor:

- **Cue keys must be `Cue` + `class`.** `CuemsScript.from_json` still *accepts* a payload keyed
  `AudioCue`, but `CuemsScript.save` refuses it with a schema error, and the session gets the error
  frame. Today's save wrapper (`project-edit/sequence/sequence.component.ts:1141`,
  `{ [cueTypeKey]: newCue }`) therefore cannot save against the new editor. It is the first site to port.
- **`Media.duration` may be a bare string or wrapped.** The editor overwrites every media duration from
  its database before saving, so the value sent is not authoritative either way
  (`sequence.component.ts:1046` sends the bare `file_list` string today).
- **FadeCue durations** must be present and greater than zero; the editor rejects the save with a
  message naming each offending cue (unchanged).
- **A dangling `action_target`** (an ActionCue or FadeCue pointing at a deleted cue) is refused at save
  with the library's message. The editor no longer clears it silently.
- **Do not send `schemaLocation` back.** A payload that still carries the
  `{http://www.w3.org/2001/XMLSchema-instance}schemaLocation` key is refused.

---

## 4. The string boolean form survives, and simplifying it is out of scope

> ## ⚠️ SUPERSEDED by [`06-amendment-feature-014.md`](06-amendment-feature-014.md) §1–§3
>
> **The string form does not survive.** `cuems-utils` feature **014** retypes `cms:BoolType` to
> `xs:boolean`, so the wire carries JSON `true` / `false` and the library **refuses** `'True'` on
> ingestion. Three consequences, each measured in that amendment:
>
> - `sequence.component.ts:997` (`cue.enabled ? 'True' : 'False'`) becomes a **hard, simultaneous**
>   change: saving fails without it. It is the only such line in this repository.
> - `settings.component.ts:176`'s `online === true` **becomes correct by itself** — do not add the
>   dual read if this repository ships with or after 014.
> - the `:498` dual read's `=== 'True'` half becomes dead code and is retired deliberately.
>
> The section below is kept as the record of the contract that held until 014 was decided
> (2026-10-02). Read it for the mechanism, not for the instruction.

```
project-edit/sequence/sequence.component.ts:498   enabled: cueData.enabled === true || cueData.enabled === 'True',
```

This dual read is the compatibility mechanism for a wire that still carries the string form. **Keep it**,
and say in the spec that keeping it is deliberate. Its simplification remains an optional follow-up.

The same form now reaches **node** fields: `adopted` and `online` on `node_list` nodes are `"True"` /
`"False"` (§5). `settings.component.ts:176` reads `online === true` and must use the dual read.

---

## 5. The domain entanglement — untangled on the editor side

**Before payload version 1**, `cuems-editor` merged `network_map` node status into the project mappings
and served both as `initial_mappings`, with `nodeconf_available` beside them. **Now** (editor 001 T058):

| Frame | When | Value |
|---|---|---|
| `initial_mappings` | on connect | the **output mapping document only**, in 013's shape. No node status, no `nodeconf_available` |
| `node_list` | on connect (after `initial_mappings`), on every `network_map.xml` change, after `nodelist_modify`; also the reply to `nodelist_get` | `{"nodes": [...], "new_nodes": [...], "nodeconf_available": bool}` |

**`initial_mappings`, 013 shape** (axis A):

```json
{"number_of_nodes": 1,
 "defaults": [{"default": {"&": "<node>_system:playback_1", "class": "audio", "direction": "output"}}, ...],
 "nodes":     [{"node": {"uuid": "...", "mac": "...", "devices": [{"device": {"class": "audio", "outputs": [...], "inputs": [...]}}, ...]}}],
 "new_nodes": [...]}
```

- `default_audio_output` / `default_video_output` are gone; the port is `defaults[].default["&"]`,
  selected by `class` and `direction`. An empty default has no `"&"`.
- A mapping node's outputs are under `devices[].device`, by `class` (any string — `lighting` occurs), not
  under `audio` / `video` / `dmx`.

**`node_list` nodes**: `uuid` a string, `adopted` / `online` `"True"` / `"False"`, `node_role`
(`"controller"`, `"node"`, …; there is no `node_type`), `ip`, `name`, `mac`, the optional `role_id` /
`alias` / `hostname`, and — for a node that has a mapping node — that node's `devices`.
`nodeconf_available` is an envelope field, sampled when the frame is built: it is not on any node and is
not a field of any document. `online` is discovery (~30 s); `node_status.alive` is liveness. Show both.

**Three consumers here move together**:

```
components/settings/settings.component.ts:37-42                             initialMappings() → node_list
components/projects/project-show/audio-mixer/audio-mixer.component.ts:115   localStorage 'initial_mappings', node.audio → devices
components/projects/project-show/video-mixer/video-mixer.component.ts:94    localStorage 'initial_mappings', node.video → devices
```

The editor's half has **landed on its branch**. "Do not land either half alone" now means: this flow
lands before, or with, that editor branch's coordinated tag — never after a deploy of it.

**Two of the three read `localStorage` directly.** After the upgrade the cache holds an old **shape**,
not just an old split. The eviction story — a version key, a clear on connect, or a migration — is part
of this change, not a follow-up; the payload version (§6) is a natural key for it.

---

## 6. The handshake — this repository's only gate

This repository is **not packaged**, so the release gate cannot reach it. The editor now sends, as the
**first frame of every connection**, before `users`, `session_id` and `initial_mappings`:

```json
{"type": "payload_version", "value": 1}
```

A peer that never sends it speaks version 0, the wire before 001. The editor bumps the integer by one
whenever an existing message loses, renames or reorders a key, changes a value's form, or changes
audience; it does not bump for a new message type or a new optional key. Every bump is a row in
`../cuems-editor/tests/ws-command-responses.txt`.

A UI built for another version **refuses and says so**. The refusal path needs a design here: what the
operator sees and what they are told to do. A mismatch that renders nothing is not better than
`[object Object]`.

| | What | Lives |
|---|---|---|
| **payload version** | the editor ↔ UI handshake | first frame on the wire |
| **`doc_version`** | the on-disk document marker | never on the wire, never here |

---

## 7. The repair report and the save gate — this repository is where they become visible or are lost

Every successful `project_load` is followed by **`document_load_report`** (also for a clean load):

```json
{"type": "document_load_report", "value": {
  "report_id": "<uuid>", "project_uuid": "<uuid>", "document": "<path>",
  "outcome": "clean" | "converted" | "repaired",
  "file_differs_from_loaded": false,
  "conversions": [{"from_version": 1, "to_version": 2, "description": "...", "dropped_elements": []}],
  "repairs": [{"field_path": "<cue_id>/<field>", "previous_value": ..., "substituted_value": ..., "rule_name": "..."}]}}
```

`file_differs_from_loaded` (a JSON boolean) is load-bearing: a load never writes, so an unsaved document
is repaired identically on every open. Without the flag shown, that reads as a bug; with it, it reads as
"this file needs saving".

**The save gate — new, and the UI must take part.** For a `converted` or `repaired` project, the editor
refuses `project_save` with

```json
{"type": "repair_save_refused", "value": {"project_uuid": "...", "report_id": "...", "reason": "unacknowledged"}}
```

until **this session** sends

```json
{"action": "repair_acknowledge", "value": {"project_uuid": "...", "report_id": "..."}}
```

and receives the echo `{"type": "repair_acknowledge", ...}`. Another session's acknowledgment does not
count, and a new load issues a new `report_id`. The first save after acknowledgment moves the original
file into the library's trash before writing; if that move fails, `reason` is `"preserve_failed"` and
nothing was written. **Without an acknowledge step in the UI, a repaired project cannot be saved.**

**The failure case** replaces the `project` frame:

```json
{"type": "document_load_failed", "value": {
  "project_uuid": "...", "document": "<path>", "cue_id": "<uuid>" | null, "field": "<name>" | null,
  "message": "<library text>",
  "next_steps": ["restore_from_conversion_backup", "correct_field_by_hand", "remove_document"]}}
```

The session survives and the project stays listed. Show the document, the field and all three next
steps; a message that says only "this will not open" leaves a broken project and nowhere to go.

`project_duplicate`'s reply may carry an optional `report` (same shape as `document_load_report`'s
value) when the source was not clean.

---

## 8. Other frames since payload version 1

| Frame | Audience | Here |
|---|---|---|
| `initial_template` | — | **retired**, no longer sent. Build new scripts from `schema_descriptor` |
| `schema_descriptor` (`{"action": "schema_descriptor", "value": "<schema>"}`) | caller | `{"schema": ..., "types": [{"key": "script:AudioCueType", "fields": [{"name", "xsd_type", "required", "repeated", "order", "kind", "enum_values", "default", "repairability"}], "instance": {...}}]}`. Defaults measured: `master_vol` 100, `dmx_channels` `null`, `opacity` 100. The per-type `instance` is **not in wire shape** (`03-migration-inventory.md` §2c) |
| `config_save` | caller | refuses `script`, `hardware_outputs` and non-schemas; **answers an error for `settings`, `network_map`, `project_mappings`, `project_settings`** until `cuemsutils` has public JSON ingestion for config documents (`cuems-editor` UR-5). Adoption stays `nodelist_modify` |
| `network_map_error` | all sessions | `{"kind": "duplicate_identity", "identity": "<uuid>", "file": "<path>"}`, or `null` when cleared. Show it on the adoption screen |

Unchanged: `nodelist_modify` (`{"type": "nodelist_modify", "value": "OK"}` or the error frame, error
text relayed verbatim), `node_status`, and the engine's OSC `cluster_warning`.
