<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# Tasks: Schema-Descriptor Migration

**Input**: Design documents from `/specs/001-schema-descriptor-migration/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: **REQUIRED, and they come first.** Decision D35 and constitution Principle IV make the
test work the premise of this feature, not an option — see the warning below.

**Organization**: grouped by the eight user stories in [spec.md](spec.md), in priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story this task serves (US1–US8)
- Every task names its file path.
- **Suffixed ids** (T031a, T032a, …) were inserted by `/speckit-analyze` remediation after the
  first numbering. They run in the position they are written in, like any other task; the suffix
  only avoids renumbering the tasks below them.

## Path Conventions

Single Angular application. Source under `src/app/`; **each spec file sits beside the file it
covers**, as the six existing specs do. There is no separate `tests/` tree and this feature does not
introduce one.

---

## ⚠️ Two deviations from the template, both deliberate

**1. Characterization tests must PASS, not fail.** The generic template says to write tests first and
ensure they FAIL. That is TDD, and it is the opposite of what Phase 2 does. These are
*characterization* tests: they pin **today's** behaviour and must pass against **unmodified**
production code. A characterization test that fails on today's code is simply wrong. Then, after the
port, the same tests must still pass — with only their input fixtures swapped, and no expectation
edited. See [contracts/characterization-rules.md](contracts/characterization-rules.md).

**2. Foundational comes *after* User Story 1.** The template puts foundational infrastructure before
all stories. Here, D35 forbids touching any of the three rewritten files before their behaviour is
pinned and committed. So Phase 2 (characterization) is the real blocking phase, and the shared
session infrastructure follows it in Phase 3.

---

## Phase 1: Setup (fixtures and harness)

**Purpose**: produce the payloads and the harness the characterization needs. No production code is
touched in this phase.

- [X] T001 [P] Capture the post-001 `project` frame by running `../cuems-editor/specs/001-cuems-utils-migration/evidence/project-capture/capture_load.py` against the editor's `tests/fixtures/script_minimal_013.xml` in the editor's environment, saving to `specs/001-schema-descriptor-migration/fixtures/project-013.frame.json` — *done via `fixtures/capture/capture_tip.py`: the editor's script predates its own load-report change; see fixtures/README.md*
- [X] T002 [P] Capture the script schema descriptor via `ConfigManager.get_schema_descriptor(SchemaName.SCRIPT)` in the editor's environment to `specs/001-schema-descriptor-migration/fixtures/schema-descriptor-script.json`; confirm the measured defaults `master_vol` 100, `dmx_channels` null, `opacity` 100, and whether the per-type instances are still non-wire-shaped (if they are now wire-shaped, UR-1 is answered — record that and skip T052, the transform; T049 is unrelated and stays)
- [X] T003 Derive the `node_list` fixture into `specs/001-schema-descriptor-migration/fixtures/node-list.frame.json` from `../cuems-editor/specs/001-cuems-utils-migration/evidence/initial-mappings.json` by applying the four deltas pinned in `../cuems-editor/tests/test_node_merge.py` (m1 `nodeconf_available` present beside the arrays; m2 `adopted`/`online` as the strings `"True"`/`"False"`; m3 `node_role` present and **no** `node_type`; m4 the arrays and flag live in the `node_list` frame, not inside `initial_mappings`), committing the derivation script beside the output — *replaced by a recording (`capture_tip_nodes.py`): the tip now emits `node_list` directly and has retired m2 (booleans are JSON); see fixtures/README.md and findings F5*
- [X] T004 [P] Copy the three recorded pre-001 payloads into `specs/001-schema-descriptor-migration/fixtures/` — the project frame, `initial_template` and `initial_mappings` — preserving each one's capture metadata
- [X] T005 Write `specs/001-schema-descriptor-migration/fixtures/README.md` recording each fixture's provenance, and stating the caveat from research R4 in full: `initial-mappings.json` was captured with the **pre-001 editor path** on the **post-013 library**, so it is the merged frame with the new device shape and JSON `false` booleans — valid as the source of truth for the device/defaults shape, **invalid** as a `node_list` fixture
- [X] T006 [P] Create the characterization harness helper in `src/app/testing/characterization-harness.ts`: stub providers for the nine services `ProjectEditSequenceComponent` injects (`ActivatedRoute`, `Router`, `ProjectsService`, `ProjectEditStateService`, `MediaService`, `TranslateService`, `NotificationService`, `DrawerService`, `ProjectWorkspaceService`) and a factory using `TestBed.runInInjectionContext(() => new Component())` that does **not** render the template and does **not** call `ngOnInit`
- [X] T007 [P] Add a fixture loader in `src/app/testing/load-fixture.ts` that reads the JSON payloads from `specs/001-schema-descriptor-migration/fixtures/` so no test inlines a payload literal
- [X] T008 Add `"test:ci": "ng test --no-watch --browsers=ChromeHeadless"` to `package.json` and confirm the existing six specs pass under it

**Checkpoint**: fixtures exist with provenance; the harness instantiates each target component without rendering.

---

## Phase 2: User Story 1 — Today's behaviour is pinned (Priority: P1) 🎯 MVP and blocking gate

**Goal**: pin the current behaviour of the three untested files that this feature rewrites, driven
by recorded payloads, so the port is measured rather than asserted.

**Independent Test**: `npm run test:ci` passes on an otherwise **unmodified** working tree, and the
suite now exercises the adopt/unadopt path, the cue-type ladder and save wrapper, the five template
reads including all three output-structure call sites, and the projects service's payload intake and
cache round trip.

**⚠️ CRITICAL**: no task in Phase 3 or later may touch `projects.service.ts`,
`project-edit/sequence/sequence.component.ts` or `settings.component.ts` until T025 is committed.

### Characterization — `projects.service.ts`

- [X] T009 [P] [US1] Create `src/app/services/projects/projects.service.spec.ts` pinning the `initial_template` intake and its `localStorage` round trip, fed the recorded pre-001 template payload
- [X] T010 [US1] Pin the `initial_mappings` intake and the full `extractMappingOptions` output in `src/app/services/projects/projects.service.spec.ts`, fed the recorded mapping payload: the audio and video entries keyed `<node uuid>_<output id>`, the DMX entry keyed by the **bare node uuid with no suffix**, and the one-entry-per-node DMX de-duplication
- [X] T011 [US1] Pin the nullable-payload paths in `src/app/services/projects/projects.service.spec.ts`: null template and null mappings signals, an absent `value` wrapper, and an unparseable cache entry
- [X] T012 [US1] Pin the identity and lookup helpers in `src/app/services/projects/projects.service.spec.ts`: `nodeLabel` and `getNodeLabel`'s fallback chains, `getNodeNumberByUuid`, `parseOutputString`, `formatOutputNameForDisplay`, and `findOutputInMappings` for audio and video
- [X] T013 [US1] Pin the project-status transitions in `src/app/services/projects/projects.service.spec.ts`: `running`, `loaded`, neither, and `project_unload`, plus the error relay for the listed project actions

### Characterization — `project-edit/sequence/sequence.component.ts`

- [X] T014 [P] [US1] Create `src/app/components/projects/project-edit/sequence/sequence.component.spec.ts` pinning `transformCuesFromProject` against the recorded pre-001 project frame: per-cue type resolution, `enabled: cueData.enabled === true || cueData.enabled === 'True'`, `master_vol: cueData.master_vol || 20`, the DMX channel unwrap, and the fade duration unwrap `duration?.CTimecode`
- [X] T015 [US1] Pin `addCue` for all five types in `src/app/components/projects/project-edit/sequence/sequence.component.spec.ts`: the template reads, the master-volume resolution `|| 20`, the DMX seed `[{channel: 1, value: 0}]` (the component's own fallback, which is what operators see today because the template branch never fires), and the default audio/video/dmx output assignment
- [X] T016 [US1] Pin `getTemplateOutputStructure('audio')` and `('video')` in `src/app/components/projects/project-edit/sequence/sequence.component.spec.ts`, fed the recorded `initial_template`, capturing the exact cloned structure each produces — and the `null` it returns when no template is present
- [X] T017 [US1] Pin `transformCueToServerFormat` per cue type in `src/app/components/projects/project-edit/sequence/sequence.component.spec.ts`: the `cueTypeKey` ladder's five values, the save wrapper `{ [cueTypeKey]: newCue }`, `enabled = cue.enabled ? 'True' : 'False'`, `master_vol = cue.master_vol || 20`, and the DMX write-back including the empty-channel branch
- [X] T018 [US1] Pin the effect of all three `getTemplateOutputStructure` call sites in `src/app/components/projects/project-edit/sequence/sequence.component.spec.ts` — the one inside `transformCueToServerFormat`, and those in `assignMultipleAudioOutputs` and `assignMultipleVideoOutputs` reached through `onOutputSelectionChange` — recording what each produces and what it does when the structure is null
- [X] T019 [US1] Pin the read side and the duration display in `src/app/components/projects/project-edit/sequence/sequence.component.spec.ts`: `getCueTypeKey`, `getCueData`, and `getCueMediaDuration` — **including the case with no media file selected, where today's return value is the wrapper object and renders as `[object Object]`**. Pin that wrong output explicitly; it is the defect US2 fixes and the assertion that proves it was fixed

### Characterization — `settings.component.ts` (the adoption tier)

- [X] T020 [P] [US1] Create `src/app/components/settings/settings.component.spec.ts` pinning the presence predicates against the recorded node payload: `isAlive` returning `'alive' | 'absent' | 'unknown'`, `livenessAge`, and `isSeenByDiscovery` — whose `online === true` read returns **false for every node** against a string-boolean payload
- [X] T021 [US1] Pin `canAdopt` and `canUnadopt` in `src/app/components/settings/settings.component.spec.ts`. `canAdopt` is `nodeconfAvailable() && isSeenByDiscovery(...)`, so it is **false for every node** today — amendment 2 §2 names this as the assertion that tells the pre- and post-014 cases apart. `canUnadopt` tests `node_type !== 'NodeType.master'` against a key that no longer exists, so it is **permanently true**, including for the controller
- [X] T022 [US1] Pin the adoption emit and its response handling in `src/app/components/settings/settings.component.spec.ts`: `confirmAddNode` and `confirmRemoveNode` emitting `{action: 'nodelist_modify', modify_action: 'ADD'|'REMOVE', value: uuid}`, the `nodelist_modify` response subscription, the `node_status` poll, and `nodeconfAvailable`'s `!== false` reading — which makes an **absent** flag mean "available"
- [X] T023 [US1] Pin `getNodeName`, `getAudioOutputs`, `getVideoOutputs` and `getMappedName` in `src/app/components/settings/settings.component.spec.ts`, fed the recorded mapping payload — the two output getters read `node.audio` / `node.video` and together are **site 3 of the five** device-shape sites research R2 found — one row per file, both getters in it, as T091 migrates them

### Phase 2 gate

- [X] T024 [US1] Add a comment block to each of `src/app/services/projects/projects.service.spec.ts`, `src/app/components/projects/project-edit/sequence/sequence.component.spec.ts` and `src/app/components/settings/settings.component.spec.ts` naming the **only two sanctioned expectation changes** (FR-004a, and the pair is closed — it may not be extended once the port has begun) — master volume 20 → 100 (FR-032) and `canAdopt` flipping once the booleans change (FR-057) — and stating that any other divergence is a finding to record, never a test to edit
- [X] T025 [US1] Run `npm run test:ci`, confirm green against **unmodified** production code, and commit the characterization as its own GPG-signed commit. This commit's date must precede every port commit (exit criterion 1)

**Checkpoint**: the instrument exists and is committed. Port work may now begin.

---

## Phase 3: Foundational (session prerequisites)

**Purpose**: the shared session machinery that User Stories 3, 4, 6 and 7 all build on. Placed here,
after Phase 2, because it touches `projects.service.ts`.

- [X] T026 [P] Create `src/app/core/payload-cache.ts`: one reserved key prefix for every wire-payload cache entry, with the payload version stored **inside** that namespace; read, write and clear-by-prefix; every access wrapped in try/catch so a browser that blocks storage still works. Per-operator preferences (`userLanguage`, the floating play-controls position) live **outside** the prefix and are never touched. Record the eviction rule and **why it is a prefix and not a list of key names** in a comment at the top of this file (FR-091: a future reader of the code must find the reason, not just the release notes)
- [X] T027 Create `src/app/core/payload-version.service.ts` reading `{"type": "payload_version", "value": <int>}` as the first frame of every connection, treating a peer that never sends it as **version 0**, and comparing against the implemented version
- [X] T028 Implement the shared prerequisite gate in `src/app/core/payload-version.service.ts` (FR-034b): an ordered, named prerequisite list resolved before any project-domain route renders, so the version gate and the descriptor gate share **one** mechanism rather than one per screen
- [X] T029 Implement eviction in `src/app/core/payload-version.service.ts`: clear the whole payload namespace when the stored version differs from the announced one **in either direction**, and treat a **missing** stored version as a difference — that is the state of every browser in the field today
- [X] T030 Ensure eviction runs before any screen reads a cached payload (FR-075) by sequencing it in `src/app/core/payload-version.service.ts` as research R8 fixes the order: version known → evict → request descriptor → render
- [X] T031 Delete the `initial_template` cache entry and the code that reads it, in `src/app/services/projects/projects.service.ts` — it is deleted, not migrated, because a cache entry for a frame the server no longer sends can never be refreshed
- [X] T031a Move **every** existing wire-payload `localStorage` access onto `PayloadCache` (FR-071a), so T029's prefix eviction cannot miss an entry that is still written under a legacy key: `src/app/services/projects/projects.service.ts:244` (`initial_mappings` read), `:339` (`initial_mappings` write) and the `initial_template` accesses at `:236`/`:320` deleted by T031, plus the two direct reads at `src/app/components/projects/project-show/audio-mixer/audio-mixer.component.ts:115` and `src/app/components/projects/project-show/video-mixer/video-mixer.component.ts:94` (T094 repoints these onto the service; until it lands they must at least read through the namespace). Measured 2026-10-03: those are the only payload keys in `src/`; `userLanguage` (`language.service.ts`, `app.component.ts`) and the play-controls `STORAGE_KEY` are preferences and stay outside the prefix
- [X] T031b [P] Add to `src/app/core/payload-cache.spec.ts` the assertion that closes the hole T031a fills: no wire payload is reachable at a bare key after eviction. Sweep `src/app/` (`*.ts` **and** `*.html`) for `localStorage` occurrences and assert the only ones outside `PayloadCache` are `userLanguage` and the play-controls position — a new payload cached at a bare key later is then a failing test, not a silent stale render (SC-009) — *implemented as `tools/wire-guards.mjs`, run by `npm run test:ci` before Karma: the browser-hosted suite cannot read the source tree*
- [X] T032 Implement a single reconnect owner in `src/app/core/payload-version.service.ts` that re-runs the prerequisite sequence on reconnect and notifies consumers; the WebSocket service auto-reconnects on error, and this same event invalidates a repair acknowledgement, so it has two consumers and one owner
- [X] T032a Publish the reconnect event from `src/app/services/websocket.service.ts`, which T032's owner needs and which does not exist today: `reconnect()` is **private** and **replaces** `this.ws` with a new `webSocket(...)`, so nothing is notified and any consumer holding the old subject keeps a dead one. Expose a public `reconnected` observable emitted from the new connection's `openObserver`, keep `isConnected` as it is, and create `src/app/services/websocket.service.spec.ts` beside it (constitution Principle IV — this file has no spec today)
- [X] T032b Keep the live project status separate from the once-per-connection one (FR-019) in `src/app/services/projects/projects.service.ts`: `loadedProjectUuid` is filled from a single `project_status` query per connection and goes stale when a project is loaded in another tab or by the power bridge's boot auto-load, so anything that must be live keeps reading `oscService.loadedProject()`, which the engine broadcasts on every change. The port must not collapse the two, and T032's owner must re-query `project_status` on reconnect — the documented staleness window closes exactly there. The doc comment at `projects.service.ts:200-214` already states the rule; keep it true and cover both in `projects.service.spec.ts`
- [X] T033 [P] Ensure an unrecognised frame `type` is ignored without error in `src/app/services/projects/projects.service.ts` — the editor does **not** bump the payload version for a new message type, so a client cannot treat an unknown frame as a version fault
- [X] T034 [P] Create `src/app/core/payload-version.service.spec.ts` and `src/app/core/payload-cache.spec.ts` covering: version 0 inference, mismatch, eviction in both directions, missing-version eviction, preferences surviving, and an unparseable entry
- [X] T035 [P] Add a guard test asserting `doc_version` appears nowhere in `src/` — it is the on-disk document marker, never on this wire, and must stay out

**Checkpoint**: the gate, the cache namespace and the reconnect owner exist and are covered — including that **no** wire payload is left at a bare `localStorage` key (T031a/T031b) and that the reconnect event is published rather than inferred (T032a).

---

## Phase 4: User Story 2 — A project opens and saves against the 001 editor (Priority: P2)

**Goal**: restore the primary task. Today the library accepts the old per-type cue keys on ingest and
refuses them at save, so no project can be saved at all.

**Independent Test**: against a running 001 editor, open a project with one cue of each hardware
class plus an action and a fade cue, edit a value, save, reload, and confirm the change persisted.

- [X] T036 [P] [US2] Delete the non-optional `schemaLocation: string` declaration from the project payload interface in `src/app/services/projects/projects.service.ts` — delta (a) makes the key absent and nothing reads it
- [X] T037 [US2] Ensure no save path sends a `schemaLocation` key back, in `src/app/components/projects/project-edit/sequence/sequence.component.ts` — the editor refuses a payload still carrying it
- [X] T038 [US2] Replace the `cueTypeKey` ladder in `src/app/components/projects/project-edit/sequence/sequence.component.ts` so the three hardware classes resolve to the single cue key plus a `class` field, while `ActionCue`, `FadeCue` and `CueList` keep their own keys and carry no class
- [X] T039 [US2] Update the save wrapper in `src/app/components/projects/project-edit/sequence/sequence.component.ts` to emit `{"Cue": {…, "class"}}` for hardware cues and `{"CueOutput": {…, "class"}}` for their outputs
- [X] T040 [US2] Update `getCueTypeKey` and `getCueData` in `src/app/components/projects/project-edit/sequence/sequence.component.ts` to map the single cue key plus `class` onto today's internal type union
- [X] T041 [US2] Update every cue-output read in `src/app/components/projects/project-edit/sequence/sequence.component.ts` from the per-type output keys to `CueOutput` plus `class`, including the output-name collection paths and the `_custom_` alias lookup
- [X] T042 [P] [US2] Update the cue identity, name, type and data ladder in `src/app/components/projects/project-show/sequence/sequence.component.ts` to read the single cue key plus `class`
- [X] T043 [P] [US2] Create `src/app/components/projects/project-show/sequence/sequence.component.spec.ts` covering the ported ladder and `getCueDuration` — constitution Principle IV requires changed behaviour to carry a covering spec in the same change, and this file is beyond FR-001's three
- [X] T044 [P] [US2] Update the output-volume read and write in `src/app/components/projects/shared/audio-mixer/audio-mixer.component.ts` to `CueOutput`, and create `audio-mixer.component.spec.ts` beside it
- [X] T045 [US2] Treat `class` as **open vocabulary** in `src/app/components/projects/project-edit/sequence/sequence.component.ts`: a cue whose class has no editor here is listed and identified by its class, is never an error, and survives a save unchanged. Internal vocabulary — type unions, icons, translation keys, routes — may keep the words `audio`, `video`, `dmx`, because they are not wire keys
- [X] T046 [US2] Change the enabled write in `src/app/components/projects/project-edit/sequence/sequence.component.ts` from `cue.enabled ? 'True' : 'False'` to the native boolean. Measured: the native form is accepted by the current library **and** after the upstream boolean retyping, while the string form is refused after it — so this lands now and is what unblocks that upstream feature
- [X] T047 [P] [US2] Unwrap the media duration in `src/app/components/projects/project-show/sequence/sequence.component.ts` `getCueDuration`, copying the fade path's `duration?.CTimecode` pattern already correct in the same file
- [X] T048 [US2] Unwrap the media duration in `getCueMediaDuration` in `src/app/components/projects/project-edit/sequence/sequence.component.ts`, the operand reached when no media file is selected, which `sequence.component.html:134` renders
- [X] T049 [US2] Ensure nothing treats the presence of a video cue's `opacity` as evidence the operator set it, in `src/app/components/projects/project-edit/sequence/sequence.component.ts` — delta (d) means the schema default now arrives where the document had none
- [X] T049a [US2] Relay a refused save's own message to the operator, offending cue included — the `error` frame obligation in `contracts/editor-ui-frames.md` and the spec's zero-length-fade / dangling-target edge case. Two things to check in `src/app/services/websocket.service.ts`: `parseErrorMessage` extracts only the first `Reason: (.+?)\n` capture, so verify against a recorded refusal that the cue identifier survives that extraction (widen it if it does not), and the 3-second `hasRecentError` window must not swallow the message before a surface shows it. Then confirm the text reaches an operator-visible surface in the project-edit path rather than only `errors.next(...)`, and cover it in `sequence.component.spec.ts`
- [X] T050 [US2] Re-run `npm run test:ci` with the sequence characterization fed the post-001 project fixture. Only the **input fixture** changes; confirm no expectation was edited, and that T019's `[object Object]` assertion now asserts a timecode as the recorded fix

**Checkpoint**: a project round-trips against the 001 editor. The largest operator-facing defect is closed.

---

## Phase 5: User Story 3 — New cues are built from the schema descriptor (Priority: P3)

**Goal**: replace the retired template with the descriptor at all four consuming files, with the
three value-reading sites on descriptor defaults.

**Independent Test**: with the cache cleared, add one cue of each type to an empty project; each
arrives complete and saves.

- [X] T051 [US3] Create `src/app/services/projects/handlers/schema-descriptor.handler.ts` requesting `{"action": "schema_descriptor", "value": <schema name>}` — **parameterised by schema name, not hard-coded** — issuing `script` on connect as the project domain's prerequisite, and exposing each parsed response keyed by schema name. The outbound contract also owes `settings`, `project_settings` and `project_mappings` for the read-only config views (T104), which request theirs on view entry rather than on connect; one handler serves all four. Note that a field's `default` is `null` when it is a factory **or** absent — `null` does not mean "no default"
- [X] T052 [US3] Implement the wire-shape transform in `src/app/services/projects/handlers/schema-descriptor.handler.ts` as **one named function** carrying the identifier `UR-1` in its comment: add the `CueOutput` wrapper, invert `channels` from `{"channel": [...]}` to `[{"channel": {...}}]`, and substitute each `null` scalar with that field's descriptor `default`. Every value originates in the descriptor; nothing is hand-authored. Skip if T002 found the instances already wire-shaped
- [X] T053 [US3] Register the descriptor as a hard prerequisite in `src/app/core/payload-version.service.ts` (FR-034a): absent, unanswered or unusable blocks the project domain through the shared gate, stating the reason. No local fallback, no cached copy, no creation-only restriction
- [X] T054 [US3] Set the new-audio-cue master volume to the descriptor's default of **100** at all three resolving sites in `src/app/components/projects/project-edit/sequence/sequence.component.ts` — the creation path, the intake path and the write-back path — replacing `|| 20`. This is a behaviour change visible to operators: a new audio cue starts five times louder
- [X] T055 [US3] Keep the one-channel DMX seed in `src/app/components/projects/project-edit/sequence/sequence.component.ts` and record in a comment that it is a **UI-level starting value deliberately differing from the descriptor's default of none**, not the schema's answer
- [X] T056 [US3] Repoint `getTemplateOutputStructure` in `src/app/components/projects/project-edit/sequence/sequence.component.ts` at the transform, and verify all three call sites — the one in `transformCueToServerFormat` and those in `assignMultipleAudioOutputs` and `assignMultipleVideoOutputs` — produce a wire-shaped structure and **never** undefined
- [X] T057 [US3] Report rather than absorb a descriptor gap in `src/app/components/projects/project-edit/sequence/sequence.component.ts` (FR-034): a descriptor that arrives but lacks a type or field a call site asks for surfaces the gap instead of producing a silently empty or partial cue
- [X] T058 [P] [US3] Repoint `safeCloneTemplate` and `prepareTemplateForNewProject` onto the descriptor in `src/app/services/projects/handlers/project-create.handler.ts`, and create `project-create.handler.spec.ts` beside it
- [X] T059 [P] [US3] Repoint the template read in `src/app/components/projects/project-edit/project-edit.component.ts` onto the descriptor, and create `project-edit.component.spec.ts` beside it covering the changed behaviour
- [X] T060 [US3] Remove the `initial_template` response handling, the signal and the response-type entry from `src/app/services/projects/projects.service.ts`, leaving nothing unreachable behind
- [X] T061 [P] [US3] Create `src/app/services/projects/handlers/schema-descriptor.handler.spec.ts` covering the request, the parse, and the transform's three steps against the captured descriptor fixture
- [X] T062 [US3] Add the master-volume change to `specs/001-schema-descriptor-migration/release-notes.md` (collected by T115)

**Checkpoint**: every template consumer is on the descriptor; new cues are complete and saveable.

---

## Phase 6: User Story 4 — A repaired document is visible, acknowledged, saveable (Priority: P4)

**Goal**: make a backend repair visible, acknowledgeable, and therefore saveable. Without the
acknowledgement step a repaired project cannot be saved at all.

**Independent Test**: open a project the editor reports as repaired, see the report, acknowledge it,
save successfully; then open an unloadable project and see the named field plus all three next steps.

- [X] T063 [P] [US4] Handle `document_load_report` in `src/app/services/projects/projects.service.ts`, retaining `report_id`, `project_uuid`, `outcome`, `file_differs_from_loaded`, `conversions[]` and `repairs[]`, plus **whether this session has shown the operator that report**
- [X] T064 [US4] Create `src/app/components/projects/project-load-report/project-load-report.component.ts` showing a `converted` or `repaired` outcome field by field before the operator edits anything, and making a `clean` outcome discoverable without interrupting them
- [X] T065 [US4] Render `file_differs_from_loaded` as "this file needs saving" in `src/app/components/projects/project-load-report/project-load-report.component.html` — it is a JSON boolean describing editor state, and a load never writes, so without it a recurring repair reads as a bug
- [X] T066 [US4] Send `{"action": "repair_acknowledge", "value": {project_uuid, report_id}}` from `src/app/services/projects/projects.service.ts` and consume the echo as the go-ahead to retry the save
- [X] T067 [US4] Handle `repair_save_refused` with `reason: "unacknowledged"` in `src/app/services/projects/projects.service.ts`: explain the refusal in terms of the report and offer the acknowledgement rather than a bare error
- [X] T068 [US4] Implement the reconnect path in `src/app/services/projects/projects.service.ts` against the single reconnect owner from T032: when a refusal names a report **this session already showed the operator**, re-send the acknowledgement for the id the refusal names, retry the save **at most once**, and tell the operator it happened. When it names a report the operator was never shown, show it and wait for confirmation first — an acknowledgement is never sent for a report no human has seen
- [X] T069 [US4] Surface a second refusal for the same report to the operator instead of retrying again, in `src/app/services/projects/projects.service.ts`
- [X] T070 [US4] Handle `reason: "preserve_failed"` in `src/app/components/projects/project-load-report/project-load-report.component.ts`, telling the operator plainly that **nothing was written**
- [X] T071 [US4] Handle `document_load_failed` in `src/app/components/projects/project-load-report/project-load-report.component.ts`, showing `document`, `cue_id`, `field`, the library's `message` and **all three** `next_steps` (`restore_from_conversion_backup`, `correct_field_by_hand`, `remove_document`) — the list is always all three — while the project stays listed and the session usable
- [X] T072 [P] [US4] Surface the optional `report` on a `project_duplicate` reply the same way as a load report, in `src/app/services/projects/projects.service.ts`
- [X] T073 [P] [US4] Create `src/app/components/projects/project-load-report/project-load-report.component.spec.ts` covering clean, converted, repaired, the unacknowledged refusal, the reconnect re-acknowledge path, the already-shown versus never-shown branch, the single retry bound, `preserve_failed`, and the failure form
- [X] T074 [P] [US4] Add translation keys for all new report text to `src/assets/i18n/en.json`, `es.json` and `ca.json` — all three locales in the same change

**Checkpoint**: a repaired project can be seen, acknowledged and saved, and a reconnect does not cost the operator their edits.

---

## Phase 7: User Story 5 — Adoption works across the node-list split (Priority: P5)

**Goal**: port the adoption/liveness tier onto the new frame. This is a port with its logic
preserved (D26), not a rebuild.

**Independent Test**: against a real controller, adopt a discovered node and un-adopt an adopted one
through this screen, confirming the node daemon acted in both cases.

- [X] T075 [US5] Handle the `node_list` frame in `src/app/services/projects/projects.service.ts`, exposing `nodes`, `new_nodes` and `nodeconf_available`. It arrives on connect after `initial_mappings`, after each successful `nodelist_modify`, on every `network_map.xml` change, and as the reply to `nodelist_get` — which carries the same payload and so needs no extra handling
- [X] T076 [US5] Rename `src/app/components/settings/` to `src/app/components/nodes/` as `node-adoption.component.*`, moving its spec with it, and update the route. The existing name is for the `settings` domain while the component edits `network_map` nodes; FR-058 forbids inheriting that mistake
- [X] T077 [US5] Source the node arrays and `nodeconf_available` from the node-list frame in `src/app/components/nodes/node-adoption.component.ts`, not from the mapping payload
- [X] T078 [US5] Make an **absent** `nodeconf_available` disable the adopt controls in `src/app/components/nodes/node-adoption.component.ts`, replacing today's `!== false`. The flag is an envelope fact sampled when the frame is built, is on no node and in no document, and at this payload version is always present when the frame is — so absence is a fault, not a default
- [X] T079 [US5] Verify the discovery-presence read in `src/app/components/nodes/node-adoption.component.ts` against the wire actually shipped against: shipping with or after the upstream boolean retyping, `online === true` is already correct and **must be left alone**; shipping before it requires the transitional dual read. T021's `canAdopt` assertion is what tells the two cases apart
- [X] T080 [US5] Fix the controller guard in `src/app/components/nodes/node-adoption.component.ts` to test `node_role !== 'controller'`. The element it tests today was renamed upstream and the key is absent, so `undefined !== 'NodeType.master'` is always true and un-adopting is wrongly offered — including for the controller, which the daemon then refuses. Independent pre-existing defect, in scope because the file is being ported
- [X] T081 [US5] Keep the two presence facts separate in `src/app/components/nodes/node-adoption.component.html`: discovery presence (~30 s) and sub-second liveness as two labelled indicators, never merged. Preserve the existing comment explaining why, and keep `livenessAge`'s freshness display
- [X] T082 [US5] Keep a failed or timed-out liveness poll rendering as **unknown, never dead**, in `src/app/components/nodes/node-adoption.component.ts` — the engine serializes commands, so a poll can time out behind a slow project load while every node is healthy
- [X] T083 [US5] Preserve the adopt/unadopt emit and response contract in `src/app/components/nodes/node-adoption.component.ts`: `{action: 'nodelist_modify', modify_action: 'ADD'|'REMOVE', value: uuid}`, with the daemon's `{'OK': bool, 'error'?: str}` shape treated as a contract and its error text relayed **verbatim**
- [X] T083a [US5] Send `{"action": "nodelist_get"}` from `src/app/components/nodes/node-adoption.component.ts` for the targeted refresh FR-050 names as one of the four ways the frame arrives — `grep` finds no `nodelist_get` anywhere in `src/` today. The reply is an ordinary `node_list`, so T075's handler needs no addition. Use it on view entry and after a reconnect, so the screen recovers without a page reload when a push is missed; keep it out of the liveness poll's path, which is `node_status`
- [X] T084 [US5] Handle `network_map_error` in `src/app/services/projects/projects.service.ts` and show it on the adoption screen in `src/app/components/nodes/node-adoption.component.html`: `{kind: "duplicate_identity", identity, file}`, cleared by a `null` value
- [X] T085 [US5] Update `src/app/components/nodes/node-adoption.component.spec.ts` by swapping its fixture for the derived `node_list` payload, confirming no expectation was edited apart from T024's two sanctioned changes
- [X] T086 [P] [US5] Add translation keys for the duplicate-identity message and any new adoption text to all three locale files in `src/assets/i18n/`

**Checkpoint**: adopt and unadopt work end to end against the real daemon; both presence facts read correctly.

---

## Phase 8: User Story 6 — Mixers and default outputs read the current mapping shape (Priority: P6)

**Goal**: move every mapping read onto the 013 shape. Research R2 found **five** device-shape
consumers, not the two the planning bundle lists.

**Independent Test**: open both mixers against a controller whose map includes more than one device
class, and create one audio and one video cue, confirming each lands on the configured default.

- [X] T087 [US6] Replace the per-class default fields with `defaults[]` in `src/app/services/projects/projects.service.ts`, selecting by `class` and `direction` and reading the port text from the key `"&"`. **An empty default has no `"&"`** — yield no default and invent no placeholder
- [X] T088 [US6] Update the four default-output read sites in `src/app/components/projects/project-edit/sequence/sequence.component.ts` onto `defaults[]` by class and direction, including the DMX default
- [X] T089 [US6] Migrate `extractMappingOptions` in `src/app/services/projects/projects.service.ts` from `node.audio` / `node.video` / `node.dmx` to `node.devices[].device` selected by `class`. **This is site 1 of 5 and the most consequential**: its failure blanks every cue's output selector. Note the extra nesting level — a device's `outputs` is a **list of lists** — and preserve the existing contract that a DMX mapping uses the bare node uuid with no output suffix
- [X] T090 [US6] Migrate `findOutputInMappings` in `src/app/services/projects/projects.service.ts` onto `devices[].device` by class (site 2 of 5)
- [X] T091 [US6] Migrate `getAudioOutputs` and `getVideoOutputs` in `src/app/components/nodes/node-adoption.component.ts` onto `devices[].device` by class (site 3 of 5) — without this the adoption screen lists no outputs for any node
- [X] T092 [P] [US6] Migrate the node filter and output walk in `src/app/components/projects/project-show/audio-mixer/audio-mixer.component.ts` onto `devices[].device` by class (site 4 of 5)
- [X] T093 [P] [US6] Migrate the node filter and output walk in `src/app/components/projects/project-show/video-mixer/video-mixer.component.ts` onto `devices[].device` by class (site 5 of 5)
- [X] T094 [US6] Make both mixers read the mapping payload through the projects service instead of `localStorage` directly, in `audio-mixer.component.ts` and `video-mixer.component.ts`, so T029's eviction cannot be bypassed by a screen reading a cache the gate has not cleared
- [X] T095 [US6] Ignore an unhandled device `class` without error at all five sites — `src/app/services/projects/projects.service.ts` (both `extractMappingOptions` and `findOutputInMappings`), `src/app/components/nodes/node-adoption.component.ts`, `src/app/components/projects/project-show/audio-mixer/audio-mixer.component.ts` and `src/app/components/projects/project-show/video-mixer/video-mixer.component.ts` — because the vocabulary is open and `lighting` is present in the recorded payload; and tolerate a device carrying no `inputs` key, as the video, dmx and lighting devices in that payload do
- [X] T096 [P] [US6] Create `audio-mixer.component.spec.ts` and `video-mixer.component.spec.ts` beside the two project-show mixers, covering the device walk, an unknown class, and a node with no devices
- [X] T097 [US6] Re-run `npm run test:ci` with the projects-service characterization fed the recorded 013 mapping payload, confirming the mapping-option output matches the pinned expectations apart from the shape change itself

**Checkpoint**: every output selector and both mixers populate from the current mapping shape.

---

## Phase 9: User Story 7 — A version mismatch is refused and a stale cache never renders (Priority: P7)

**Goal**: the operator-facing half of the gate built in Phase 3 — the refusal surface, and eviction
demonstrated.

**Independent Test**: load with a pre-upgrade cache and confirm no screen renders from it; point at a
peer announcing a different version and confirm the refusal.

- [X] T098 [US7] Create `src/app/components/payload-gate/payload-gate.component.ts` as the **single** refusal surface: while a mismatch stands, no project, media, mixer or configuration screen renders. It must not be a per-screen condition — a surface that forgets it would present misread values as data
- [X] T099 [US7] Render the refusal in `src/app/components/payload-gate/payload-gate.component.html` naming **both** versions and what the operator should do, and keep the shell alive behind it so the message is readable and the language selection still works. A mismatch that renders nothing is no better than rendering a wrapped value as an object
- [X] T100 [US7] Render the descriptor-prerequisite failure through the same `src/app/components/payload-gate/payload-gate.component.ts` surface with the descriptor named as the reason, exercising T028's shared mechanism rather than adding a second gate
- [X] T101 [US7] Treat a peer that never announces a version as the pre-upgrade wire and refuse it on the same basis, in `src/app/core/payload-version.service.ts`
- [X] T102 [P] [US7] Create `src/app/components/payload-gate/payload-gate.component.spec.ts` covering a mismatch, a silent peer, the descriptor failure, and the shell remaining usable
- [X] T103 [P] [US7] Add translation keys for the refusal text to all three locale files in `src/assets/i18n/`

**Checkpoint**: both prerequisites refuse visibly through one surface, and a pre-upgrade cache cannot render.

---

## Phase 10: User Story 8 — An operator can inspect the controller's configuration (Priority: P8)

**Goal**: read-only views of the three config documents, each named for the document it shows. The
write half is blocked upstream and is registered, not attempted.

**Independent Test**: open each of the three views against a real controller and confirm the values
match the documents on disk.

- [X] T103a [US8] **Resolve where the three config documents' current values come from, before writing any view.** Measured 2026-10-03: no artifact in this feature identifies an inbound frame carrying the contents of `settings` or `project_settings`. `schema_descriptor` serves the *schema* (fields, types, enums, defaults) and not a document's values; `initial_mappings` covers the mapping document only; `config_save` is the blocked write half (UR-5). FR-080 asks each view for its document's **fields and values**, so the descriptor answers the field half alone. Check `../cuems-editor/tests/ws-command-responses.txt` for a config read frame and record the answer in `research.md` as R10. Two outcomes, both acceptable: **(a)** the frame exists — handle it in `src/app/services/projects/projects.service.ts` and feed T104's renderer; **(b)** it does not — file a new upstream report for a config-document read, register the three views as its blocked consumer as T112 does for UR-5, build the views as descriptor-driven field lists stating that values are not yet available, and record the value half as **not performed** with that report as the reason (FR-090, T114). Do not fabricate values from the descriptor's defaults in either case — a default is not what the controller holds
- [X] T104 [US8] Create the descriptor-driven read-only renderer in `src/app/components/config/schema-document-view/schema-document-view.component.ts`, rendering a document's fields and values from a `schema_descriptor` response rather than a hand-maintained form. Request the descriptor for `settings`, `project_settings` and `project_mappings` through T051's parameterised handler on view entry — the outbound contract's "other schema names" — and take the values from whatever T103a established, which may be "not available yet"
- [X] T105 [P] [US8] Create `src/app/components/config/controller-settings/controller-settings.component.ts` for the `settings` document, named for that document
- [X] T106 [P] [US8] Create `src/app/components/config/project-settings/project-settings.component.ts` for the `project_settings` document
- [X] T107 [P] [US8] Create `src/app/components/config/project-mappings/project-mappings.component.ts` for the `project_mappings` document — the one domain that already has read consumers here, in the two mixers
- [X] T108 [US8] Ensure no view offers a way to change a value, and each states that editing is not yet available, in `src/app/components/config/controller-settings/`, `src/app/components/config/project-settings/` and `src/app/components/config/project-mappings/`. No `config_save` action is sent from anywhere in `src/app/`: the editor answers an error for all four config domains, so sending it would only earn an error frame
- [X] T109 [US8] Add the three routes in `src/app/app.routes.ts` and their navigation entries in `src/app/components/layout/app-header/app-header.component.html`, naming each for the document it shows and not repeating the existing settings-named-but-edits-network-map mistake
- [X] T110 [P] [US8] Create `schema-document-view.component.spec.ts` plus a spec per view, covering an absent field, an enum field, and a document the descriptor does not fully describe
- [X] T111 [P] [US8] Add translation keys for the three view titles and the "editing not yet available" text to all three locale files in `src/assets/i18n/`
- [X] T112 [US8] Register this repository's save-path dependency against **UR-5** in `../cuems-editor/specs/001-cuems-utils-migration/upstream-reports/UR-5-no-public-config-json-ingestion.md`, adding the frontend views as a blocked consumer beside the editor's own need. UR-5's "Expected" section already covers what the views need, so this adds a consumer row, not a requirement. **Cross-repository change — confirm before committing** — *moot: UR-5 closed upstream before this task was reached; the remaining blocker is UR-2 (see not-performed.md)*
- [ ] T112a Link UR-1 where `cuems-utils` will see it, mirroring T112's registration of UR-5: `specs/001-schema-descriptor-migration/upstream-reports/UR-1-descriptor-instance-not-wire-shaped.md` is authored and complete here and addressed **to** `cuems-utils`, but nothing in that repository points at it. Add the pointer row there (or, if that repository keeps no report index, state in UR-1's header that filing-by-authoring-in-the-consumer-repo is this ecosystem's convention and name where it was announced). FR-036 counts the report as filed, not merely written. **Cross-repository change — confirm before committing**
- [X] T113 [US8] Record the config-save path as **not performed** with UR-5 as the stated reason, in `specs/001-schema-descriptor-migration/not-performed.md` (created by T114) — *reason is now UR-2 and the owner's 2026-10-07 decision, not UR-5*

**Checkpoint**: all three config documents are inspectable; the blocked write path is registered and recorded.

---

## Phase 11: Polish & Cross-Cutting Concerns

- [X] T114 Create `specs/001-schema-descriptor-migration/not-performed.md` recording every item that could not be performed, **per entry with its reason** — the config-save path (UR-5), the wire-shape descriptor instance if UR-1 is still open, the deliberately deferred string-boolean read retirement, and — if T103a found no config read frame — the value half of the three config views with that new report as the reason. Silence is not an acceptable third state; this is the convention the landed sibling repositories followed
- [X] T115 Create `specs/001-schema-descriptor-migration/release-notes.md` enumerating the operator-visible changes in one place: new audio cues start at volume 100 rather than 20; the adopt control is live again; un-adopting the controller is no longer offered; cached payloads are cleared on first connect after upgrade while language and panel preferences are kept; and a wrong-version or descriptor-less editor now blocks the project screens with a stated reason
- [X] T116 [P] Verify every new operator-facing string goes through the translate pipe and that every new key exists in all three of `src/assets/i18n/en.json`, `es.json` and `ca.json`
- [X] T117 [P] Add a field note to `CLAUDE.md` for what this feature changed, per the repository's own convention
- [X] T118 Confirm no node-model test was introduced anywhere in `src/` — the node model lives upstream and is reached only through the editor's wire; such a test here is a regression, not coverage
- [X] T119 Confirm the port introduced no path written **alongside** an old one rather than replacing it, sweeping every changed file under `src/app/` — including `*.html`, which a `grep` over `*.ts` misses. In a 1803-line component with no prior tests this is the likely outcome rather than a risk, which is why `/speckit-check-integration` earns its place in this flow — *now a standing guard in tools/wire-guards.mjs*
- [X] T120 Run the full `quickstart.md` validation, including the three live checks the unit suite cannot cover: the round trip against the 001 editor, adopt/unadopt against the real daemon, and the repair acknowledgement — *offline parts done (§1–§3; library round trip, findings F18); the live checks of §4 are recorded as not performed: no controller in this environment*
- [X] T121 Run `npm run test:ci` and confirm green, with the three Phase 2 spec files intact and no expectation edited beyond T024's two sanctioned changes — *278/278; the expectations that moved are each traced in the specs (`moved:`) and in findings F10, F14, F20, F23 — the closed pair proved narrower than the tasks' own mandates*
- [ ] T122 Cut the annotated, signed `xml-refactor-merge-candidate` tag on `feat/xml-refactor`, naming `feat/node-adoption-ui` as included, as the editor's tag message does for its own siblings. **Nothing releases from this branch alone** (D27) — the tag is a candidate, not a deploy

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: no dependencies — starts immediately. T001–T003 need the editor's environment
- **Phase 2 (US1)**: depends on Phase 1. **BLOCKS every later phase** that touches the three
  characterized files. T025's commit is the boundary
- **Phase 3 (Foundational)**: depends on Phase 2. Blocks US3, US4, US6's cache safety, and US7.
  Within it: T031a re-keys the live cache entries and must land with T029's eviction or the eviction
  misses them; T032a publishes the reconnect event T032's owner consumes, so it comes first; T032b
  needs T032's owner to hang the `project_status` re-query on
- **Phase 4 (US2)**: depends on Phase 2 only. T049a touches `websocket.service.ts`, so it is easier
  after T032a has given that file its spec, but it does not require it
- **Phase 5 (US3)**: depends on Phase 3 — the descriptor is a gate prerequisite (T053 needs T028)
- **Phase 6 (US4)**: depends on Phase 3 — shares the reconnect owner (T068 needs T032)
- **Phase 7 (US5)**: depends on Phase 2 only. T083a needs T076's rename and T075's handler
- **Phase 8 (US6)**: depends on Phase 2; T094 depends on Phase 3's eviction; T091 depends on T076's rename
- **Phase 9 (US7)**: depends on Phase 3 (the mechanism) and Phase 5 (the descriptor reason)
- **Phase 10 (US8)**: depends on Phase 5 — shares the descriptor renderer. **T103a comes first and
  gates T104–T107**: it settles where the three documents' values come from, and outcome (b) changes
  what those views promise. T112a is independent of the views and can land any time after planning
- **Phase 11 (Polish)**: depends on every story being complete

### Story dependencies, honestly stated

The template's ideal is that all stories are independent after the foundational phase. Here they are
**not**, and pretending otherwise would mislead whoever schedules the work:

```
Phase 1 ──> Phase 2 (US1) ──┬──> Phase 4 (US2)  ────────────────┐
         [commit boundary]  ├──> Phase 7 (US5) ──┐              │
                            ├──> Phase 8 (US6) ──┤              │
                            └──> Phase 3 ──┬──> Phase 5 (US3) ──┼──> Phase 9 (US7)
                              (foundation) │                    │
                                           ├──> Phase 6 (US4)   ├──> Phase 10 (US8)
                                           └────────────────────┴──> Phase 11
```

- **US2, US5, US6** are genuinely independent of each other and need only Phase 2
- **US3, US4, US7, US8** form a chain through the shared session machinery and the descriptor
- **US7's phase ordering is lower than its technical importance.** It is P7 by operator value but
  its mechanism (Phase 3) is required by US3 and US4. The mechanism is built early; only its
  operator-facing surface waits for Phase 9

### Within each phase

- Characterization is written to **pass** against unmodified code, not to fail
- Services before the components that read them
- A changed file's spec lands in the same change as the change (constitution Principle IV)
- Translation keys land with the text that needs them, in all three locales

### Parallel Opportunities

- T001, T002 and T004 run together (different outputs); T003 needs T004's copy of the mapping capture
- T006 and T007 run together with the captures
- T009, T014 and T020 start the three spec files in parallel — different files, no shared state
- T026, T033, T034 and T035 are parallel within Phase 3; T031b is parallel with them once T031a
  lands, and T032a precedes T032/T032b rather than running beside them
- **Three whole phases run in parallel after Phase 2**: US2 (Phase 4), US5 (Phase 7) and US6
  (Phase 8), with the two cross-links noted above
- T042/T043, T044, T047 are parallel within US2 (three different files)
- T092, T093 and T096 are parallel within US6
- T105, T106 and T107 are parallel within US8
- Every locale-key task (T074, T086, T103, T111) touches the same three files, so they are **not**
  parallel with each other

---

## Parallel Example: Phase 2 (User Story 1)

```bash
# Start the three characterization spec files together — different files, no shared state:
Task: "T009 Create src/app/services/projects/projects.service.spec.ts pinning the initial_template intake and localStorage round trip"
Task: "T014 Create src/app/components/projects/project-edit/sequence/sequence.component.spec.ts pinning transformCuesFromProject"
Task: "T020 Create src/app/components/settings/settings.component.spec.ts pinning the presence predicates"
```

## Parallel Example: after the Phase 2 commit

```bash
# Three independent phases, one per developer:
Developer A: Phase 4 (US2) — the round trip, T036-T050 (incl. T049a)
Developer B: Phase 7 (US5) — the adoption port, T075-T086 (incl. T083a)
Developer C: Phase 8 (US6) — the mapping reads, T087-T097
```

---

## Implementation Strategy

### MVP first

**The MVP here is not a feature — it is the instrument.** Phase 1 + Phase 2 deliver value on their
own: the repository's three most business-critical files gain the coverage they have never had,
whether or not the port proceeds. That is finding C8 closed, and it is what makes every later
acceptance criterion mean anything. **Stop and validate here**: the suite must be green against
unmodified code, and T025 committed, before anything else starts.

### Then, by operator value

1. **Phase 4 (US2)** — the round trip. This is the one the operator notices most, because saving is
   impossible today. Deployable value on its own
2. **Phase 3 + Phase 5 (US3)** — the descriptor, which restores complete cue creation
3. **Phase 6 (US4)** — the repair gate, without which repaired projects cannot be saved
4. **Phase 7 (US5)** — adoption, restoring a dead control on a screen in daily use
5. **Phase 8 (US6)** — the mapping reads, restoring every output selector
6. **Phase 9 (US7)** — the refusal surface
7. **Phase 10 (US8)** — the read-only config views, the only purely additive story

### Release

Nothing deploys from this branch. The candidate tag (T122) is cut when the exit criteria are met and
ships with `cuems-editor`'s half under the coordinated tag (D27).

---

## Notes

- **Do not edit a characterization expectation to make ported code pass.** That is the moment the
  guarantee is lost. Two changes are sanctioned in writing (T024); anything else is a finding to
  record
- `initial-mappings.json` is **not** a `node_list` fixture, however much it looks like one (T005)
- Commits are GPG-signed; on a signing failure, retry rather than bypassing it
- A `grep` over `*.ts` misses Angular templates — any sweep for payload reads must cover `*.html`
- Match names by segment, never substring: `"cue" in "cuems"` is true, and that mistake has already
  produced a false report in a sibling repository
- Line numbers in the planning bundle are stale (research R1). Locate by symbol
