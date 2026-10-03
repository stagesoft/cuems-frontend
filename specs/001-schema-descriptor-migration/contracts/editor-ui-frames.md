<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# Contract — frames this repository consumes, and what it owes each one

**Authority**: `../cuems-editor/tests/ws-command-responses.txt`. This file is the *consuming*
obligation: for each frame, what this repository must do, and the observable failure if it does not.
Shapes are in [`../data-model.md`](../data-model.md); they are not repeated here.

**This repository cannot change any of these shapes.** Where a frame's form is awkward, the
obligation is a defensive read, not a negotiation.

---

## Inbound — editor → UI

| Frame | When | This repository's obligation | Observable failure if unmet |
|---|---|---|---|
| `payload_version` | first frame, every connection | Compare with the implemented version. On a mismatch, or on a peer that never sends it, refuse at the shell and name both versions. Then evict caches if the stored version differs | Wrapped values render as objects; a mismatched peer looks like a working one |
| `schema_descriptor` | reply to the client's request | Request `script` on connect. Read per-field `default`s for values; read the per-type `instance` through the wire-shape transform. Absent or unusable → refuse at the shell | New cues built from this repository's own magic numbers, or with no outputs at all |
| `initial_mappings` | on connect | Read `defaults[]` by class and direction; read nodes' outputs from `devices[]` by class. Cache under the payload namespace | Every cue-output selector blank; new cues with no target; both mixers empty |
| `node_list` | on connect, after `nodelist_modify`, on every map change; reply to `nodelist_get` | Source the adoption screen's nodes **and** `nodeconf_available` from here, not from the mapping frame. Dual-read the string booleans for the wire actually shipped against | The Adopt button dead for every node; an absent daemon flag read as "available" |
| `node_status` | reply to the client's poll | Keep `alive` as a **separate** fact from `online`. A failed or timed-out poll is *unknown*, never dead. Polling is cheap (2 s server cache) | The operator told a healthy node is dead, or a vanished node is alive |
| `network_map_error` | all sessions, while it stands | Show on the adoption screen; clear on the `null` frame | A duplicate identity silently degrades the node list and nobody knows why |
| `project` | reply to `project_load` | Read hardware cues and outputs by `Cue` / `CueOutput` + `class`; unwrap `Media.duration`; tolerate an unknown `class`; ignore the absent `schemaLocation` | Cues unnamed or dropped; `[object Object]` in every duration |
| `document_load_report` | after **every** successful load | Surface it, clean outcomes included. Show repairs field by field. Show `file_differs_from_loaded` as "this file needs saving". Retain `report_id` and whether the operator was shown it | A silent repair — the exact outcome the three-outcome design exists to prevent |
| `document_load_failed` | instead of `project` | Show document, `cue_id`, `field`, the library's message and **all three** `next_steps`. Keep the project listed and the session usable | "This will not open", a broken project, and nowhere to go |
| `repair_save_refused` | on a refused save | `unacknowledged` → acknowledge and retry once if this session showed the operator that report, otherwise show it first. `preserve_failed` → tell the operator plainly that **nothing was written** | A repaired project that cannot be saved, with no path offered |
| `repair_acknowledge` | echo of the client's action | Treat as the go-ahead to retry the save | The retry never fires and the refusal looks permanent |
| `nodelist_modify` | after an adopt/unadopt | `"OK"` → refresh from the pushed `node_list`. Error → relay the daemon's text **verbatim** | The operator sees a generic failure for a specific, fixable daemon condition |
| `project_duplicate` | reply | Surface the optional `report` the same way as a load report | A duplicate silently carries repairs |
| `error` | any refused action | Relay the editor's message. Fade-duration and dangling-target refusals name the offending cue — keep that detail | A save fails and the operator cannot tell which cue to fix |
| `initial_template` | **never again** | Stop reading it, delete its handler, and delete its cache entry | A cache that can never be refreshed, feeding a retired shape into new cues |

---

## Outbound — UI → editor

| Action | Contract this repository must honour |
|---|---|
| `project_save` / `project_new` | Hardware cues keyed `Cue` + `class`, outputs `CueOutput` + `class`. `enabled` as a **native boolean**. **No `schemaLocation` key** — a payload carrying it is refused. Fade durations present and greater than zero. No dangling `action_target` |
| `repair_acknowledge` | `{project_uuid, report_id}`, for a report **this session** holds. Never sent for a report no human has been shown |
| `schema_descriptor` | `{"value": "script"}` on connect. Other schema names for the read-only config views |
| `nodelist_modify` | `{value: <node uuid>, modify_action: "ADD"\|"REMOVE"}` — unchanged by this feature. The daemon's `{'OK': bool, 'error'?: str}` response shape is a contract with the adoption screen |
| `nodelist_get` | Targeted refresh of the node list without reconnecting. Reply is a normal `node_list`, so no extra handling |
| `node_status` | The liveness poll. Repeats within 2 s are cached server-side |
| `config_save` | **Not sent by this feature.** Answers an error for all four config domains until UR-5 is resolved. Sending it would only earn an error frame |

---

## Version discipline

The editor bumps the payload version when an existing message **loses, renames or reorders a key**,
**changes a value's form** (the string booleans included), or **changes audience**. It does **not**
bump for a new message type or a new optional key.

Two consequences for this repository:

1. A client **cannot** infer from the version that new frames exist. An unrecognised frame type must
   be ignored without error, not treated as a version fault.
2. When `cuems-utils` 014 turns the string booleans into JSON booleans, that **is** a form change
   and therefore a bump. The defensive reads must be correct on both sides of it, and the one
   **write** of a string boolean must become native — which is also what unblocks 014.
