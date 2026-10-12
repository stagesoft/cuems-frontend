<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# Upstream gates — what `cuems-frontend` 001 waits on in sibling repositories

The index to cite from outside. Each row is one finding addressed to another repository, its state,
and the code in this repository that stands in for the answer or waits on it. Detail lives in the
linked file; this table only routes.

**Report numbers are per repository and collide**: always quote the repository with the number —
`cuems-frontend` UR-1 is not `cuems-editor` UR-1.

**Re-measured 2026-10-12** against `cuems-editor` `feat/xml-refactor` @ `1144a1d` (feature 002
merged) and `cuems-utils` @ `cdb3bef` (014 branch, the commit 002 was verified against). First
measured 2026-10-06/07 at `22093fd` / `69acaef`.

## The coordinated tag's gates

The ecosystem now numbers them in one list (`cuems-editor` `specs/002-config-round-trip/tag-readiness.md`,
`cuems-utils` `specs/planning/upcoming-feature-requirements-2026-10-02.md` §0a). Each stands as a
strict xfail in the editor; none is closed.

| Gate | Report | Owner | Effect on this repository |
|---|---|---|---|
| **G1** | `cuems-editor` UR-6 — `conf_path`/`project_path` refuse a file not yet created | `cuems-utils`, then the editor | none while the config views are read-only: a project's *first* `config_save` fails until it lands |
| **G2** | `cuems-editor` UR-7 — `project_settings` has no public read projection | `cuems-utils`, then the editor | the project-settings view shows the editor's refusal instead of values (`config_load` answers the error frame naming UR-7) |
| **G3** | **`cuems-frontend` UR-1** (+ addendum) — the descriptor `instance` is not in `to_wire()` shape; required fields have null defaults. Now also the config roots (`settings`, `project_mappings`, `project_settings` instances unsaveable) | `cuems-utils` | `toWireShape` + `UR1_UI_STARTING_VALUES` in `src/app/services/projects/handlers/schema-descriptor.handler.ts` — delete both when it closes |
| **G4** | `cuems-editor` UR-8 — no `node_set` in cuems-nodeconf | `cuems-utils` (`NodeIndex.set_alias`), then `cuems-nodeconf` | none yet: alias editing (`node_set`) is not built here (owner's decision 2026-10-12) |
| **G5** | 013's reshape defeats F3's `settings` 1 → 2 conversion | `cuems-utils` | none directly |

## Filed by this repository, answered by `cuems-editor` 002

| Finding | Answered by | What changed here (2026-10-12) |
|---|---|---|
| **`cuems-frontend` UR-2** — no config document read | 002 US2: `config_load` and revision-checked `config_save` | The three config views show their file's values and revision (`ConfigDocumentsService`). Editing stays out by the owner's decision of 2026-10-12, not by a gate |
| **Boolean form changed without a bump** (findings F6) | 002 US3: version 1 restated with JSON booleans, no string handling needed (FR-001–004) | The `"True"` reads of `enabled` and `online`, and the string arm of the node type, are gone; `tools/wire-guards.mjs` fails on a string-boolean comparison |
| **A reconnect drops the repair gate** (findings F22) | 002 US1: the gate is per project; an acknowledgment survives a reconnect that resumes the session; a new session may acknowledge (FR-006–011) | The reload-on-reconnect is gone. The socket now resumes the editor session (`/ws?uri=<session_id>`). The re-acknowledge-and-retry path stays, for a session that cannot be resumed |
| **Building from the descriptor `instance` cannot produce a saveable cue** (item 4) | 002 US5: the protocol document qualifies the advice (FR-028); the fix itself is G3 | nothing; the stand-in stays until G3 |
| **Any key beside `CuemsScript` is refused** (item 5) | 002 FR-029: stated in the protocol document | nothing; already sent alone |
| **`capture_load.py` no longer runs** (item 6) | 002 FR-030: a new capture script beside it | nothing |

Also adopted from 002: `document_load_report`'s `acknowledgment_required` and `media_repairs`
(FR-044) — the report and the save gate key on `acknowledgment_required`, so a clean outcome with
stale media values is shown and acknowledged.

## Gates on this branch before it can release

Nothing releases from `feat/xml-refactor` alone (D27). The candidate tag is re-cut when:

1. G1–G5 are closed (the editor's tag-readiness record lists the tests that flip);
2. G3 closes — then `toWireShape` and `UR1_UI_STARTING_VALUES` are deleted here in one edit;
3. the live quickstart §4 run against a controller on the coordinated tag ([not-performed.md](not-performed.md)).

`feat/node-adoption-ui` (`13d93b7`) is already contained in this branch.
