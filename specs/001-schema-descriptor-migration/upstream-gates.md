<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# Upstream gates — what `cuems-frontend` 001 waits on in sibling repositories

The index to cite from outside. Each row is one finding addressed to another repository, its state
at the `xml-refactor-merge-candidate` tag, and the code in this repository that stands in for the
answer or waits on it. Detail lives in the linked file; this table only routes.

**Report numbers are per repository and collide** (cuems-utils' own notes say the same): always
quote the repository with the number — `cuems-frontend` UR-1 is not `cuems-editor` UR-1.

Measured against `cuems-editor` `feat/xml-refactor` @ `22093fd` and `cuems-utils` @ `69acaef`
(014 branch), 2026-10-06/07.

## Filed by this repository

| Report | To | State | What waits on it here | Detail |
|---|---|---|---|---|
| **`cuems-frontend` UR-1** — the descriptor's per-type `instance` is not in `to_wire()` shape | `cuems-utils` | 🔴 open. Pointer row added (uncommitted) to cuems-utils `specs/planning/upcoming-feature-requirements-2026-10-02.md` §0 | `toWireShape` in `src/app/services/projects/handlers/schema-descriptor.handler.ts` — delete when answered | [UR-1](upstream-reports/UR-1-descriptor-instance-not-wire-shaped.md) |
| **`cuems-frontend` UR-1 addendum** — required output fields with a null default (`output_vol`, `channel_num`/`channel_vol`, `x_scale`/`y_scale`, corner `x`/`y`) | `cuems-utils` | 🔴 open; same pointer row | `UR1_UI_STARTING_VALUES`, same file — delete with `toWireShape` | [findings.md](findings.md) F12, *Upstream reports* |
| **`cuems-frontend` UR-2** — no action reads a config document's contents | `cuems-editor` | 🔴 open; authored here, not yet linked from cuems-editor | the value half and the editing of `src/app/components/config/*`; `tools/wire-guards.mjs` fails on any `config_save` until then | [UR-2](upstream-reports/UR-2-no-config-document-read.md) |
| **Boolean form changed without a payload-version bump** | `cuems-editor` | 🔴 open, not yet filed as a numbered report | the dual reads `enabled === 'True'` (sequence intake) and `online === 'True'` (node adoption) — delete when the 014 wire has its own version | [findings.md](findings.md) F6, *Upstream reports* |
| **A reconnect drops the repair gate** — a repaired project saves unacknowledged and without preserving the original | `cuems-editor` | 🔴 open, not yet filed as a numbered report | the reload-on-reconnect in `src/app/services/projects/load-report.service.ts` — remove when the editor's gate survives a reconnect | [findings.md](findings.md) F22, *Upstream reports* |
| **`capture_load.py` no longer runs** (evidence tooling) | `cuems-editor` | 🟡 low impact, not yet filed | nothing; `fixtures/capture/capture_tip.py` replaces it here | [fixtures/README.md](fixtures/README.md) |

## Filed elsewhere, consumed here

| Report | Owner | State | Effect here |
|---|---|---|---|
| **`cuems-editor` UR-5** — no public config ingestion | cuems-editor → cuems-utils 014 | ✅ closed (`ConfigManager.from_json`) | made `config_save` work upstream; T112 (register against it) moot |
| **`cuems-editor` UR-6** — config path helpers require the file to exist | cuems-editor → cuems-utils | 🔴 open | a project's first `config_save` would fail; irrelevant until UR-2 lets the views edit |
| **cuems-utils 014** — `xs:boolean` and media elements | cuems-utils | 🟡 on its branch, already adopted by the editor tip | the wire this branch was measured against carries JSON booleans at payload version 1 (F5, F6) |

## Gates on this branch before it can release

Nothing releases from `feat/xml-refactor` alone (D27). The candidate tag is cut so the coordinated
tag has a fixed point to reference; it is **re-cut** when complementary work lands:

1. the live quickstart §4 run against a controller on the coordinated tag ([not-performed.md](not-performed.md));
2. the answers above that change code here — UR-1 (delete the transform), the boolean version bump
   (delete the dual reads), F22 (remove the reconnect reload), UR-2 (add the config values and editing);
3. the sibling halves landing under the coordinated tag (`cuems-editor` `feat/xml-refactor`, the
   cuems-utils release carrying 014).

`feat/node-adoption-ui` (`13d93b7`) is already contained in this branch.
