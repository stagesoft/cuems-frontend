<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# Not performed — and why

Every item this feature could not perform, each with its reason (FR-090). Silence is not a third
state: an item is done, or it is listed here.

| Item | Task | Reason | What would unblock it |
|---|---|---|---|
| **`project_settings` values** | T106 | `config_load('project_settings')` is refused by the editor until **cuems-editor UR-7** (gate G2) gives `cuems-utils` a public read projection; the view shows that refusal. The other two documents show their values since 2026-10-12 (`cuems-editor` 002) | G2 closed |
| **Editing the config documents** (`config_save`) | T113 | No longer blocked: `cuems-editor` 002 serves `config_load` and a revision-checked `config_save`. Not built, by the owner's decision of 2026-10-12 (values read-only). `tools/wire-guards.mjs` still fails on any `config_save` in `src/app` | Owner's go-ahead; then amend US8 (spec + tasks). A project's first save also needs **G1** (`cuems-editor` UR-6) |
| **Registering the frontend against UR-5** | T112 | Moot: UR-5 was closed upstream by cuems-utils 014 (editor `365d57f`, `d6fa83b`) before this task was reached. The blocker it would have registered against no longer exists; the remaining one is UR-2 | — |
| **A wire-shaped descriptor instance** | FR-033 | **`cuems-frontend` UR-1**, now gate **G3** of the coordinated tag, still open at `cuems-utils` `cdb3bef` (and widened by the editor to the config roots). `toWireShape` and `UR1_UI_STARTING_VALUES` stand in for it | G3 closed; delete both in one edit |
| **Signatures and exit criterion 1's date order on the first published commits** | T025, T008 | `569ee25`, `b96883b`, `2445a92`, `ff9dc3b` were pushed unsigned, before a signing key was available here; re-authoring had given the first three the same author date (2026-10-06T19:30:44), so "characterization precedes the port" holds by ancestry (`b96883b` is an ancestor of `2445a92`) but not by date. A re-signed, re-dated copy was prepared locally and **not** pushed, by the owner's choice not to rewrite published history (kept as `backup/xml-refactor-resigned`). Every commit after `da5b0c0` is signed | A force-push of the re-signed history, if the owner later wants it |
| **Alias editing (`node_set`)** | — (cuems-editor 002 US4) | Not built, by the owner's decision of 2026-10-12; end to end it is also gated on **G4** (cuems-nodeconf has no `node_set` yet) | Owner's go-ahead and G4 |
| **Pushing the branch and the candidate tag** | T122 | Nothing is pushed, per the owner: the tag is a local candidate, re-cut when complementary work lands (`upstream-gates.md`) | Owner pushes |
| **Live validation** — quickstart §4.1–§4.9 | T120 | No controller, running 001 editor or cuems-nodeconf daemon in this environment. Covered offline instead: the ported save payload saved and reloaded clean through the editor's save path (findings F18); load reports, refusals and failures from frames recorded with the editor's own serialisers; the gate, eviction and reconnect paths in the unit suite | Run quickstart §4 against a controller on the coordinated tag |
| **Adopt / un-adopt against the real daemon** | T120 (§4.5) | No cuems-nodeconf here; the emit and response contract is covered by the suite | Same |
| **Translating the adoption screen's existing text** | — (Principle VII, pre-existing) | Out of scope: text added by this feature is in all three locales; the screen's older hard-coded Spanish is not (findings F24) | A follow-up |
| **Pre-existing locale gaps** | T116 | `playControls.paused` exists only in `ca`; five `project.list.*` keys used by the project list exist in no locale. Not introduced by this feature | A follow-up |
| **Rebuilding saved cues without resetting unmodelled fields** | — (pre-existing) | Every save rebuilds each cue from the descriptor, resetting fields the UI does not edit (findings F16). Characterized and kept | Its own feature |
