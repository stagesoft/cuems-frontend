<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# Data model — the payloads this repository consumes

**This repository owns none of these shapes.** They are `cuemsutils`' schemas as `cuems-editor`
projects them, and the authoritative list is
`../cuems-editor/tests/ws-command-responses.txt`. What follows is the consuming end: what each
payload carries, what this repository reads from it, and what must not be assumed.

Every field marked **defensive** arrives in a form a naive read gets wrong. Every field marked
**absent-is-meaningful** has a defined behaviour when missing that is not "treat as default".

---

## 1. Session prerequisites

### `payload_version` — the gate

| Field | Form | Notes |
|---|---|---|
| `value` | integer | **First frame on every connection**, before `users`, `session_id`, `initial_mappings` |

- A peer that never sends it speaks **version 0** — the pre-001 wire. Absence is a value, not a
  missing field (**absent-is-meaningful**).
- Current wire: **1**.
- The editor bumps on: a key lost, renamed or reordered; a value's form changed; audience changed.
  It does **not** bump for a new message type or a new optional key — so a client cannot infer "new
  frames exist" from the version.
- Distinct from `doc_version`, which never reaches this repository and must not be introduced.

### `schema_descriptor` — request/reply, and the second prerequisite

Request: `{"action": "schema_descriptor", "value": "script"}`.

```
value = { schema, types: [ { key, fields: [...], instance: {...} } ] }
field = { name, xsd_type, required, repeated, order, kind, enum_values, default, repairability }
```

- `key` is schema-qualified: `"script:AudioCueType"`, `"script:AudioCueOutputsType"`.
- `enum_values` renders as the values themselves.
- `default` is `null` when it is a factory or absent — so **`null` does not mean "no default"**
  (**defensive**).
- `instance` is the constructible empty instance, and is **not in wire shape** — see §5 and UR-1.
- Measured defaults consumed here: `master_vol` **100**, `dmx_channels` **None**, `opacity` **100**.

---

## 2. The project document

### `project` — reply to `project_load`

`CuemsScript.to_wire()` of the script on disk, built once by the library's load. Opening a project
never writes its file. Differs from the pre-001 frame by exactly four deltas:

| Delta | Change | Read consequence |
|---|---|---|
| (a) | `schemaLocation` **absent** | the interface's non-optional declaration describes a key that is not there — delete it, and never send it back (the editor refuses a payload carrying it) |
| (b) | `Media.duration` is `{"CTimecode": "HH:MM:SS.mmm"}` | **defensive**: the object is truthy, so `… \|\| '-'` does not fall through and `[object Object]` renders instead |
| (c) | a hardware cue is `{"Cue": {…, "class"}}`; its outputs `{"CueOutput": {…, "class"}}` | every per-type-keyed read finds nothing, **and saving fails** |
| (d) | a video cue with no `<opacity>` carries `"opacity": 100` | a value appears where none was; presence is not evidence the operator set it |

Unchanged: all other keys, their order, and the `"True"` / `"False"` string booleans.

### Cue — the internal model versus the wire

| | Wire (hardware cue) | Wire (other) | Internal |
|---|---|---|---|
| key | `Cue` | `ActionCue`, `FadeCue`, `CueList` | `type: 'audio'\|'video'\|'dmx'\|'action'\|'fade'` |
| class | `class`: `"audio"`, `"video"`, `"dmx"`, **or any other string** | no `class` | — |
| outputs | `CueOutput` + `class` | — | — |
| `enabled` | `"True"` / `"False"` today, JSON boolean after 014 | same | boolean |

- `class` is **open vocabulary** (**defensive**): a class this UI has no editor for must be listed,
  identified, preserved on save, and never an error.
- Internal vocabulary — type unions, icons, translation keys, routes — may keep the words `audio`,
  `video`, `dmx`. They are not wire keys.
- `enabled` is written **native boolean**: accepted today, and the only form accepted after 014.

### Media duration — and the pattern that already exists

| | Read | Write |
|---|---|---|
| fade duration (correct today) | `duration?.CTimecode` | `{ CTimecode: … }` |
| media duration (both sites wrong) | `Media?.duration` → object | bare string from the file list |

The write is not a blocker: the editor overwrites every media duration from its database on save.

---

## 3. The mapping document

### `initial_mappings` — on connect, the output mapping document **only**

Since payload version 1 it carries no node status and no `nodeconf_available`.

```
value = { number_of_nodes, defaults: [...], nodes: [...], new_nodes: [...] }

defaults[] = { "default": { "&": "<port>", "class": "audio", "direction": "output" } }
nodes[]    = { "node": { uuid, mac, devices: [...], online, adopted, ip, name } }
devices[]  = { "device": { "class": "audio"|"video"|"dmx"|"lighting"|…, outputs, inputs? } }
outputs    = [ [ { "output": { id, name, mappings: [...], canvas_region? } }, … ] ]
```

| Field | Note |
|---|---|
| `defaults[].default["&"]` | the port text, under the key `"&"`. **absent-is-meaningful**: an empty default has no `"&"` — yield no default and invent nothing |
| `defaults[].default.class` / `.direction` | the selectors; replaces `default_audio_output` / `default_video_output` |
| `device.class` | **open vocabulary** — `lighting` occurs in the recorded payload. An unhandled class is ignored, not an error |
| `device.outputs` | **defensive**: a list **of lists**. One level deeper than the fields it replaces |
| `device.inputs` | **absent-is-meaningful**: video, dmx and lighting devices carry no `inputs` key |

**Five consumers** read a node's per-class output blocks (research R2). All five fail silently.

### `node_list` — nodes, and the daemon flag

Pushed on connect (after `initial_mappings`), after a successful `nodelist_modify`, and whenever
`network_map.xml` changes. Also the reply to `nodelist_get`, with the same payload — so a targeted
refresh needs no extra client handling.

```
value = { nodes: [...], new_nodes: [...], nodeconf_available: bool }
```

| Field | Form | Note |
|---|---|---|
| `nodes` / `new_nodes` | node wrappers | a node that has a mapping node keeps that node's keys, `devices` included. A `new_nodes` entry has **no `devices`** |
| `nodeconf_available` | JSON boolean | envelope fact, sampled when the frame is built. **Not** on any node and **not** in any document. **absent-is-meaningful**: absent disables the adopt controls (`!== false` would make absence mean "available" — a comfortable lie) |
| `uuid`, `mac`, `name`, `ip` | strings | `uuid` is the only stable key |
| `adopted`, `online` | `"True"` / `"False"` **strings** today; JSON booleans after 014 | **defensive**. `online` is discovery (~30 s), **not** liveness |
| `node_role` | `"controller"` / `"node"` / … | replaces `node_type`, which **does not exist**. `undefined !== 'NodeType.master'` is why the controller is currently un-adoptable-by-mistake |
| `role_id`, `alias`, `hostname` | optional | mutable projections of the uuid; label falls back through alias → role_id → positional |

### `node_status` — liveness, the other fact

```
value = { alive: [...], adopted: [...], controller: "uuid", age_s: 0.1, missing: [...], unreachable: [...] }
```

- `alive` is the engine's sub-second ping/pong — the only signal the GO gate trusts.
- `age_s` says how old the probe is; already consumed by `livenessAge()`.
- A failed or timed-out poll means **unknown, never dead**: the engine serializes commands, so the
  request can queue behind a slow project load while every node is healthy.
- Repeat calls within 2 s are served from a cache, so polling is cheap.
- **The two liveness facts are never merged.** `online` answers "does discovery still see this
  MAC"; `alive` answers "would the engine let this node go right now".

### `network_map_error` — duplicate identity

```
value = { kind: "duplicate_identity", identity: "<uuid>", file: "<path>" } | null
```

`null` clears it. Shown on the adoption screen. The editor keeps serving the last good node list and
does not retry the read.

---

## 4. Load reports and the save gate

### `document_load_report` — after **every** successful load, including a clean one

```
value = { report_id, project_uuid, document, outcome: "clean"|"converted"|"repaired",
          file_differs_from_loaded: bool,
          conversions: [ { from_version, to_version, description, dropped_elements[] } ],
          repairs:     [ { field_path: "<cue_id>/<field>", previous_value, substituted_value, rule_name } ] }
```

- Never omitted, never null.
- `file_differs_from_loaded` is a **JSON** boolean — editor state about the file, not a schema
  boolean field. Load-bearing: a load never writes, so without it a recurring repair reads as a bug
  and with it it reads as "this file needs saving".
- Repair values are JSON-safe (a timecode as its string, `None` as `null`).

### `repair_save_refused` / `repair_acknowledge` — the gate

```
refused:     { project_uuid, report_id, reason: "unacknowledged" | "preserve_failed" }
acknowledge: { "action": "repair_acknowledge", "value": { project_uuid, report_id } }   (client -> editor)
```

| State | Meaning |
|---|---|
| `unacknowledged` | **this session** has not acknowledged **that** `report_id`. Another session's acknowledgement does not count; a new load replaces the report |
| `preserve_failed` | the original could not be moved to the library trash — **nothing was written** |

Acknowledgement is session-scoped, and the session ends on a reconnect. The refusal names the
`report_id` to acknowledge, which is what makes the re-acknowledge-and-retry path possible — bounded
by "only for a report this session already showed the operator", and at most one retry.

### `document_load_failed` — replaces the `project` frame

```
value = { project_uuid, document, cue_id: "uuid"|null, field: "name"|null, message,
          next_steps: ["restore_from_conversion_backup", "correct_field_by_hand", "remove_document"] }
```

`next_steps` is **always all three**. `cue_id` and `field` are null for a document newer than the
library. The session stays up and the project stays listed.

---

## 5. Derived and local structures

### The wire-shape output transform (FR-033, deletion trigger UR-1)

Input: the descriptor's per-type `instance`. Output: one wire-shaped cue output.

| Step | From | To |
|---|---|---|
| wrap | *(none)* | `{ "CueOutput": { … } }` |
| invert | `channels: { "channel": [ {…} ] }` | `channels: [ { "channel": {…} } ]` |
| fill | every scalar `null` | that field's descriptor `default` |

No value is authored here. Every value traces to the descriptor.

### Cached payload versus preference

| | Cached payload | Preference |
|---|---|---|
| examples | the mapping document | chosen language, floating panel position |
| location | **one reserved key prefix**, with the payload version beside it | outside that prefix |
| on version change | the whole prefix is cleared | untouched |
| authority | never a source of truth | the operator's own setting |

Eviction rules: clear on **any** difference (a rolled-back editor leaves a *newer* cache); a
**missing** stored version counts as a difference (the field population today); the retired
template's entry is **deleted, not migrated**, together with the code that reads it; eviction
happens **before** any screen reads a cache — which is why the two mixers must stop reading storage
directly in the same change.

---

## 6. What this repository must not model

- **The node model.** It lives in `cuemsutils` exclusively and is reached only through the editor's
  wire (007 FR-030a-i). A node-model test here is a regression, not coverage.
- **`doc_version`.** Never on the wire, never here.
- **The config documents' write shape.** Blocked upstream (UR-5); the views are read-only.
- **The config documents' read shape.** Not described here because no frame carrying the current
  contents of `settings` or `project_settings` has been identified — `schema_descriptor` serves the
  schema, `initial_mappings` the mapping document alone. Settled by tasks T103a before the views are
  built; if the frame exists, its shape belongs in this file.
- **Media pixel dimensions / file size.** The editor fills them server-side after this repository has
  built the media object, and unknown keys are ignored on load.
