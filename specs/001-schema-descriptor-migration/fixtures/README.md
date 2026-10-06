<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# Fixtures — recorded payloads, no invented ones

Every file here is a frame a real `cuems-editor` produced, or a copy of one the editor's own
evidence directory recorded. None is hand-authored and none may be edited to make a test pass
(`../contracts/characterization-rules.md`). A correction is a new file beside the old one, naming
the one it supersedes.

Tests read these through `src/app/testing/load-fixture.ts`; no spec inlines a payload literal.

## Which wire each file is

Two wires matter, and the fixtures are split between them:

- **today** — what a deployed controller sends: `cuems-editor` before any 001 `src/` edit, on
  `cuemsutils` 0.1.0rc14. Payload version 0 (no `payload_version` frame). This is the wire today's
  frontend code was written against, so the **characterization** (Phase 2) is fed these.
- **tip** — `cuems-editor` `feat/xml-refactor` @ `22093fd` on `cuems-utils` @ `69acaef` (the 014
  branch head, committed and clean). Announces payload version 1. The **port** is measured against
  these: the characterization runs again with only its input swapped.

| File | Wire | Provenance |
|---|---|---|
| `project-pre001.frame.json` | today | copy of editor `evidence/project-capture/script_minimal.frame.json` (rc14; fixture sha256 equal before and after the read). Metadata: `project-pre001.capture-meta.json`, copied beside it |
| `initial-template-pre001.json` | today | copy of editor `evidence/initial-template.json` (derived there from `create-script-baseline.json`, rc14) |
| `initial-mappings-pre001.frame.json` | today | **recorded here**: `capture/capture_pre001_mappings.py` run with editor @ `e099c92` (last commit before any 001 `src/` edit) on `cuemsutils==0.1.0rc14` from the index, conf = `cuems-utils` `tests/data/{default_mappings,network_map,settings}.xml` @ `v0.1.0rc14`. `nodeconf_available` pinned `true` (host state) |
| `initial-mappings-013.json` | neither (see caveat) | copy of editor `evidence/initial-mappings.json` |
| `project-013.frame.json` | tip | **recorded here**: `capture/capture_tip.py` over editor `tests/fixtures/script_minimal_013.xml`, mirroring `CuemsDBProject.open` → `json.dumps({"type": "project", "value": script.to_wire()})`. Fixture sha256 equal before and after |
| `project-013.load-report.frame.json` | tip | same run: the `document_load_report` that follows it, via the editor's own `load_report_value`. `report_id` / `project_uuid` are fixed placeholders (the editor mints a uuid per load); `document` is the temp path of the run |
| `schema-descriptor-{script,settings,project_settings,project_mappings}.json` | tip | same run: `ConfigManager(load_all=False).get_schema_descriptor(SchemaName(name))` rendered by the editor's own `schema_descriptor_value`, `CUEMS_CONF_PATH` = editor `tests/fixtures/conf` |
| `initial-mappings-tip.frame.json` | tip | **recorded here**: `capture/capture_tip_nodes.py`, server built as editor `evidence/mappings-capture/capture_mappings.py` builds it, conf = that directory. The mapping document alone |
| `node-list.frame.json` | tip | same run: `node_list_message()`. `nodeconf_available` pinned `true` (host state) |

`capture-meta.json` records both heads (sha, subject, clean) and the fixture hashes for the
tip run. The three scripts under `capture/` are the procedure; they import the editor's own
serialisers rather than re-implementing them.

## Deviations from the plan, and why

**T001's script could not be used as written.** `evidence/project-capture/capture_load.py` calls
`CuemsDBProject.load_xml`, which at the editor tip returns `(CuemsScript, LoadReport)` and is no
longer JSON-serialisable. `capture_tip.py` follows the tip's own path instead
(`CuemsDBProject.open`), which is what `send_project` sends.

**T003's derivation was replaced by a recording.** The plan derived `node_list` from
`initial-mappings.json` by four deltas, m2 being `adopted` / `online` as the strings
`"True"` / `"False"`, because no recorded `node_list` existed. Two things changed upstream after
the plan was written: the tip now *has* a `node_list_message()` that can be recorded directly,
and editor `8f8b46e` (cuems-utils 014) retired m2 — `adopted` / `online` are JSON booleans on the
tip wire. A string-boolean fixture would characterize a frame the editor no longer sends, which is
the failure mode R4 exists to prevent. The recorded frame carries m1, m3 and m4 as specified.

**A pre-013 mapping frame was added.** The plan listed no recorded `initial_mappings` in the old
device shape (`node.audio` / `node.video` / `node.dmx`, `default_*_output` scalars). Without one,
today's `extractMappingOptions` can only be characterized as returning `[]` against the 013
capture, and T097's "same expectations after the swap" has nothing to compare. The rc14 test data
describes the same hardware as the 013 capture (same node uuids, output ids and names), so the
two mapping frames are a like-for-like pair.

## Upstream drift measured while capturing (2026-10-06)

- **The tip wire carries post-014 booleans at payload version 1.** `enabled`, `autoload`,
  `timecode`, `adopted`, `online` are JSON booleans in `project-013.frame.json` and
  `node-list.frame.json`, yet `CuemsWsServer.PAYLOAD_VERSION` is still `1`. The editor's own rule
  (`tests/ws-command-responses.txt`, "Payload version") says a value-form change of the string
  booleans is a bump. A client therefore cannot tell the two version-1 wires apart by version, and
  every boolean read must stay correct on both forms.
- **UR-5 is closed upstream.** `config_save` persists all four config domains through
  `ConfigManager.from_json` (editor `365d57f`, `d6fa83b`), pending UR-6 for a project's first save.
- **UR-1 is still open.** The per-type `instance` in `schema-descriptor-script.json` has no
  `CueOutput` wrapper, nests `channels` as `{"channel": [...]}`, and carries `null` scalars.
- **Descriptor defaults confirmed**: `AudioCueType.master_vol` 100, `VideoCueType.opacity` 100,
  `DmxUniverseType.dmx_channels` `null`.

## The caveat that is easy to miss

`initial-mappings-013.json` was captured with the **pre-001 editor code path** on the **post-013
library**. It is the *merged* frame (nodes and status inside the mapping payload) carrying the *new*
device shape, with JSON `false` booleans.

- **Valid** as the source of truth for the device and defaults shape (research R3) — its `devices`
  and `defaults` are byte-identical to `initial-mappings-tip.frame.json`'s.
- **Invalid** as a `node_list` fixture, in its envelope. It is a frame no editor ever sent to a
  deployed UI: neither today's wire nor the tip's.

Use `node-list.frame.json` for the node list and `initial-mappings-tip.frame.json` for the
mapping document.
