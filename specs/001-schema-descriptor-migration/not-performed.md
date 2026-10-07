<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# Not performed — and why

Every item this feature could not perform, each with its reason (FR-090). Silence is not a third
state: an item is done, or it is listed here.

| Item | Task | Reason | What would unblock it |
|---|---|---|---|
| **Config document values in the three views** | T103a, T104–T107 | No editor action returns a config document's contents (research R10). Defaults are not what the controller holds, so none are shown as values | **UR-2** (`upstream-reports/UR-2-no-config-document-read.md`) answered |
| **Editing the config documents** (`config_save`) | T113; owner's decision 2026-10-06 to add it | `config_save` replaces the whole document; without a read, a form would overwrite a working configuration with blanks or defaults. Decided 2026-10-07: views now, editing later. `tools/wire-guards.mjs` fails on any `config_save` in `src/app` meanwhile | UR-2 answered; then amend US8 (spec + tasks) for the edit half. A project's first save also needs cuems-utils **UR-6** |
| **Registering the frontend against UR-5** | T112 | Moot: UR-5 was closed upstream by cuems-utils 014 (editor `365d57f`, `d6fa83b`) before this task was reached. The blocker it would have registered against no longer exists; the remaining one is UR-2 | — |
| **Linking UR-1 from cuems-utils** | T112a | Cross-repository change, held for the owner's confirmation | Owner confirms; a pointer row in cuems-utils |
| **A wire-shaped descriptor instance** | FR-033 | **UR-1** still open (instances unchanged at cuems-utils `69acaef`), extended by the addendum in `findings.md` (required fields with a null default). The local transform `toWireShape` and `UR1_UI_STARTING_VALUES` stand in for it | UR-1 answered; delete both in one edit |
| **Retiring the string half of the boolean reads** | Out of scope by decision | Kept on both sides of cuems-utils 014: the cue intake's `enabled === 'True'` and the adoption screen's `online === 'True'`. Both version-1 wires exist (findings F6), so the string read cannot go until the editor bumps the payload version for 014 | cuems-editor bumps the payload version for the 014 wire; then delete both string reads |
| **Live validation** — quickstart §4.1–§4.9 | T120 | No controller, running 001 editor or cuems-nodeconf daemon in this environment. Covered offline instead: the ported save payload saved and reloaded clean through the editor's save path (findings F18); load reports, refusals and failures from frames recorded with the editor's own serialisers; the gate, eviction and reconnect paths in the unit suite | Run quickstart §4 against a controller on the coordinated tag |
| **Adopt / un-adopt against the real daemon** | T120 (§4.5) | No cuems-nodeconf here; the emit and response contract is covered by the suite | Same |
| **Signed commits and the signed candidate tag** | T025 (signature), T122 | No GPG secret key in this environment; the owner chose not to sign for now | Re-sign in order: `git rebase --exec 'git commit --amend --no-edit -S' dd692d2`, then tag |
| **Translating the adoption screen's existing text** | — (Principle VII, pre-existing) | Out of scope: text added by this feature is in all three locales; the screen's older hard-coded Spanish is not (findings F24) | A follow-up |
| **Pre-existing locale gaps** | T116 | `playControls.paused` exists only in `ca`; five `project.list.*` keys used by the project list exist in no locale. Not introduced by this feature | A follow-up |
| **Rebuilding saved cues without resetting unmodelled fields** | — (pre-existing) | Every save rebuilds each cue from the descriptor, resetting fields the UI does not edit (findings F16). Characterized and kept | Its own feature |
