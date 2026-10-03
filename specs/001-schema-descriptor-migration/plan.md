<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# Implementation Plan: Schema-Descriptor Migration

**Branch**: `feat/xml-refactor` (spec directory `001-schema-descriptor-migration`) | **Date**: 2026-10-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-schema-descriptor-migration/spec.md`

## Summary

Carry this repository's consumer half of the CueMS XML refactor across the wire `cuems-editor` 001
already serves. The operator-facing headline is that **a project cannot be saved at all today** —
the library accepts the old per-type cue keys on ingest and refuses them at save — so this is a
restoration, not an enhancement.

The approach is set by D35 and by this repository's own constitution: **characterize first, port
second, in separate commits**. Phase zero pins today's behaviour in the three untested files using
payloads recorded from a real editor; the port then runs those same tests with only their input
fixtures swapped. Two sanctioned expectation changes are named in writing before the port begins;
anything else that moves is a finding.

Research produced two corrections to the planning bundle that change the work: the device-shape
migration has **five** consumers rather than two (and the unlisted one blanks every cue's output
selector), and the recorded mapping payload is **not** usable as a node-list fixture despite looking
like one. It also closed the one design option left open for this phase: partial element serving is
not available on the wire and is not needed, because targeted refresh already exists for both
payloads that need it.

## Technical Context

**Language/Version**: TypeScript 5.7, Angular 19.2 (standalone components, signals)

**Primary Dependencies**: `@ngx-translate` (i18n, three maintained locales), Tailwind 4.1,
`osc-js`, `@angular/cdk`, `rxjs` 7.8. No `cuemsutils` dependency — this repository consumes
`cuems-editor`'s WebSocket payloads, not the library

**Storage**: none owned. Browser `localStorage` as a cache only, to be namespaced and
version-evicted by this feature

**Testing**: Karma + Jasmine via the Angular CLI builder (no `karma.conf`; CLI defaults).
Non-interactive invocation `npm test -- --no-watch --browsers=ChromeHeadless`; Chrome present at
`/usr/bin/google-chrome`

**Target Platform**: browser SPA, served statically from `/var/www` on the controller behind
Apache2

**Project Type**: single frontend application (`formitgo-tw`), not packaged — therefore outside the
ecosystem's release gate, which is why the payload-version handshake is its only gate

**Performance Goals**: none load-bearing. The one timing fact that matters is that `node_status`
repeats inside 2 s are served from a server-side cache, so the liveness poll is cheap

**Constraints**: the payload contract is owned upstream and cannot be changed here; nothing releases
from this branch alone (D27); the adoption/liveness tier's four commits must stay underneath this
feature; config-domain saves are blocked upstream (UR-5)

**Scale/Scope**: ~112 TypeScript files, 6 existing spec files. 11 files changed, 3 new spec files,
plus the new gate, report and config-view surfaces. The largest single port in the consumer set, in
the repository with the least coverage

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0.

| Principle | Gate | Pre-research | Post-design |
|---|---|---|---|
| **I. Contract consumer, not owner** | The four enumerated project deltas and the payload-version-1 frames are the whole change; defensive reads are required, not optional | **PASS** — the delta list is enumerated and closed (`contracts/editor-ui-frames.md`); anything else that moves is a bug in the editor's half, not something to accommodate here | **PASS** — every payload field this feature touches is marked *defensive* or *absent-is-meaningful* in `data-model.md`, with the failure named |
| **II. State arrives asynchronously and partially** | No component may assume a payload is present, complete or fresh | **PASS** | **PASS** — strengthened by the clarified descriptor gate: rather than scattering fallbacks, presence is established **once** at the shell (FR-034a), so creation paths may rely on it and are forbidden their own defaults |
| **III. This is where a human finds out** | Backend repairs, refusals and degraded responses must reach the operator | **PASS** — rendering the report *and* acknowledging it is the whole point of User Story 4 | **PASS** — and research found five *silent* degradations (R2) that the principle's own logic says must not stay silent; FR-062 was widened to cover them |
| **IV. Tests gate new and changed code** | New files carry specs; changed behaviour gains or updates a covering spec in the same change | **PASS** — phase zero *is* this rule being honoured, not an exception to it. The three files this feature rewrites gain the specs they lack, before being rewritten | **PASS** — commit ordering is exit criterion 1 and checkable by date; the characterization contract forbids editing expectations to accommodate the port |
| **V. localStorage is a cache, never a source of truth** | State what invalidates a cache written before the upgrade | **PASS** | **PASS** — namespaced and evicted on any version difference, with a missing version counting as a difference; the retired template entry is deleted, not migrated; the two direct readers move onto the service so the gate cannot be bypassed |
| **VI. Two liveness facts, shown apart** | `online` and `node_status.alive` stay separate | **PASS** — the tier already does this deliberately | **PASS** — carried across the node-list split unchanged; `age_s` already consumed |
| **VII. i18n is load-bearing** | New operator-facing text goes through the translate pipe, keys in all three locales | **PASS** | **PASS** — applies to the refusal screens, the report UI and the three config views, all of which are new operator-facing text |

**Result: PASS, no violations.** Complexity Tracking is therefore omitted.

Two notes, because passing cleanly is worth explaining rather than asserting:

- **Principle IV is the load-bearing one here**, and the constitution was written so that this
  feature could satisfy it rather than waive it. The gate applies to the diff, not the repository,
  which is what makes "the three largest untested files gain specs" a satisfiable requirement
  instead of an aspiration.
- **Three requirements prescribe structure** (one shell gate, one cache prefix, one transform).
  That sits with the constitution's preference for not over-abstracting because in each case the
  alternative is a *correctness* defect, not a style one: a per-screen gate can be forgotten on one
  screen, a hand-kept eviction list can omit a key added later, and transform knowledge spread
  across three call sites cannot be deleted in one edit when UR-1 is answered.

## Project Structure

### Documentation (this feature)

```text
specs/001-schema-descriptor-migration/
├── spec.md                                   # /speckit-specify + /speckit-clarify output
├── plan.md                                   # this file
├── research.md                               # Phase 0 — 9 findings and decisions
├── data-model.md                             # Phase 1 — the payloads, consuming end
├── quickstart.md                             # Phase 1 — runnable validation
├── contracts/
│   ├── editor-ui-frames.md                   #   frame-by-frame obligations, both directions
│   └── characterization-rules.md             #   the rule binding phase zero, and fixture provenance
├── upstream-reports/
│   └── UR-1-descriptor-instance-not-wire-shaped.md    # filed before planning, per FR-036
├── checklists/
│   └── requirements.md                       # spec quality, 16/16
├── fixtures/                                 # captured and derived payloads (quickstart §1)
└── tasks.md                                  # /speckit-tasks output — NOT created here
```

### Source Code (repository root)

```text
src/app/
├── services/
│   ├── websocket.service.ts                        # CHANGED: `reconnect()` is private and
│   │                                               #   replaces `ws`; it must publish a
│   │                                               #   reconnected event — that event invalidates
│   │                                               #   both the gate and the ack (T032a)
│   ├── websocket.service.spec.ts                   # NEW (Principle IV, with T032a's change)
│   └── projects/
│       ├── projects.service.ts                     # CHANGED, heaviest: delete schemaLocation;
│       │                                           #   defaults[] by class+direction; devices[] in
│       │                                           #   extractMappingOptions + findOutputInMappings;
│       │                                           #   retire initial_template; new frames
│       ├── projects.service.spec.ts                # NEW (phase zero)
│       └── handlers/
│           ├── project-create.handler.ts           # CHANGED: template -> descriptor
│           └── schema-descriptor.handler.ts        # NEW: descriptor + the wire-shape transform (UR-1)
├── core/
│   ├── payload-version.service.ts                  # NEW: handshake, prerequisites, cache eviction
│   └── payload-cache.ts                            # NEW: the one reserved key prefix
├── components/
│   ├── projects/
│   │   ├── project-edit/
│   │   │   ├── project-edit.component.ts            # CHANGED: template read
│   │   │   └── sequence/
│   │   │       ├── sequence.component.ts            # CHANGED, largest: cue keys + class, save
│   │   │       │                                    #   wrapper, ladder, master_vol x3, dmx seed,
│   │   │       │                                    #   duration unwrap, defaults, native boolean
│   │   │       ├── sequence.component.html          # CHANGED: duration render site
│   │   │       └── sequence.component.spec.ts       # NEW (phase zero)
│   │   ├── project-show/
│   │   │   ├── sequence/sequence.component.ts       # CHANGED: cue reads, getCueDuration
│   │   │   ├── audio-mixer/audio-mixer.component.ts # CHANGED: devices[]; stop reading storage
│   │   │   └── video-mixer/video-mixer.component.ts # CHANGED: devices[]; stop reading storage
│   │   └── shared/audio-mixer/audio-mixer.component.ts   # CHANGED: CueOutput read + write
│   ├── nodes/                                       # NEW (renamed from settings/): named for
│   │   ├── node-adoption.component.*                #   network_map, the document it edits
│   │   └── node-adoption.component.spec.ts          # NEW (phase zero, pins the tier)
│   ├── config/                                      # NEW: three read-only views, each named
│   │   ├── controller-settings/                     #   for its own document
│   │   ├── project-settings/
│   │   ├── project-mappings/
│   │   └── schema-document-view/                    #   descriptor-driven read-only renderer
│   └── projects/project-load-report/                # NEW: report, acknowledge, failure
└── components/payload-gate/
    └── payload-gate.component.*                     # NEW: the single refusal surface, mounted
                                                     #   at the shell above every project route
```

**Structure Decision**: the existing Angular layout is kept — services under `src/app/services`,
feature components under `src/app/components/<area>`, with each component's spec beside it, as the
six existing specs already do. Three deliberate additions:

- **`components/nodes/`** replaces `components/settings/`. That file is named for the `settings`
  domain and edits `network_map` nodes; FR-058 forbids inheriting the mistake, and the rename is the
  moment to fix it. It is a **port**, not a rewrite (D26) — the tier's logic moves across intact.
- **`components/config/`** holds the three read-only views plus the descriptor-driven renderer they
  share, each view named for the document it shows.
- **`core/payload-version.service.ts` and `core/payload-cache.ts`** are the one gate and the one
  cache namespace. They live in `core/` because they are session-wide prerequisites, not features.

## Phasing

Ordered by dependency, not by size. Phase 0 is gated on nothing and starts immediately.

| Phase | Work | Gated on |
|---|---|---|
| **0** | Capture the two missing fixtures, derive the node-list fixture, write the three characterization specs. Commit separately | nothing |
| **1** | The gate: handshake, prerequisite ordering, cache namespace and eviction, mixers off direct storage | phase 0 |
| **2** | The round trip: cue keys + `class` read and write, save wrapper, native boolean, `schemaLocation` deletion, duration unwrap at both sites | phase 0 |
| **3** | The descriptor: all four template consumers, the three value sites, the wire-shape transform, the DMX seed recorded as a UI choice | phase 1 (the descriptor is a gate prerequisite) |
| **4** | Mapping reads: `defaults[]` by class and direction, `devices[]` at all **five** sites | phase 0 |
| **5** | Adoption port: node-list frame, rename, `node_role` guard, duplicate-identity error, both badges | phase 0 |
| **6** | Report, acknowledge, reconnect retry, failure surface | phase 1 (shares the reconnect owner) |
| **7** | Resolve the config-document read path (see *Open items*), then the three read-only config views; register the save-path dependency against UR-5 | phase 3 (shares the renderer) |
| **8** | Recording: not-performed entries, release notes for the operator-visible changes, candidate tag | all |

Phases 2, 4 and 5 are independent of each other and can proceed in parallel after phase 0, with
**one cross-link**: phase 4's adoption-screen device read lands in the file phase 5 renames, so that
one task waits for the rename (`tasks.md` T091 after T076). Nothing else couples them.

**Numbering**: this table's phases are the dependency tiers; `tasks.md` numbers its own phases 1–11
and the two do not line up one-to-one. The map is: phase 0 → tasks phases 1–2, phase 1 → tasks
phase 3, phase 2 → tasks phase 4, phase 3 → tasks phase 5, phase 4 → tasks phase 8, phase 5 →
tasks phase 7, phase 6 → tasks phase 6, phase 7 → tasks phase 10, phase 8 → tasks phase 11, with
the refusal surface (tasks phase 9) carved out of phase 1's mechanism.

## Risks

| Risk | Why it is real here | Mitigation |
|---|---|---|
| The port is written *alongside* the old call instead of replacing it | A 1803-line component with no tests; this is the likely outcome rather than a hypothetical, which is why `/speckit-check-integration` earns its place in this flow | Phase zero makes the old behaviour executable, so a leftover path shows up as a test that still passes against a code path nothing reaches |
| A characterization test is edited to make the port pass | The guarantee dies quietly at that moment | The two sanctioned expectation changes are named **before** the port; `contracts/characterization-rules.md` is the written rule |
| `initial-mappings.json` used as a node-list fixture | It looks exactly like one and is in the right directory | Recorded as a caveat in research R4 and in the characterization contract, with the four deltas to apply |
| One of the five device-shape sites is missed | Three were unlisted in the bundle, and all five degrade to an empty list without erroring | FR-062 enumerates all five; quickstart §4.5 and §4.6 check the output lists and the selector specifically |
| UR-1 is answered mid-flight | The transform becomes dead code | Single function, carrying the report identifier; deleted in one edit |
| The gate delays the project screens | Two prerequisites now resolve before any project route renders | Research R8 fixes the ordering; the descriptor is one request on connect. If it ever becomes slow, R6 names the per-type request as the fix — a measurement for afterwards |

## Open items carried forward

- **Deferred by decision**: retiring the string half of the cue intake's dual read (correct on both
  sides of 014, so nothing breaks by leaving it). Out of Scope in the spec.
- **Blocked upstream**: config-domain saves (UR-5, with this repository now registered as a
  dependent consumer); a wire-shaped descriptor instance (UR-1, filed by this plan).
- **Low impact, not resolved**: whether an unknown-class cue may be reordered or deleted as well as
  preserved. Round-trip preservation is specified (FR-012); the affordance is a tasks-level choice.
- **Unresolved, and it gates the config views**: *which inbound frame carries the current contents
  of the `settings` and `project_settings` documents.* The frame list this plan worked from names
  `config_save` (blocked, UR-5) and `schema_descriptor` (the schema, not the values), and
  `initial_mappings` covers the mapping document only. FR-080 requires each view to show its
  document's **fields and values**, so the descriptor alone satisfies the field half and not the
  value half. Resolved first thing in tasks phase 10 (T103a): either the read frame exists and the
  views consume it, or it does not and the value half is recorded as not performed against a new
  upstream report, per FR-090. Phase 7 of the table above should not start before that answer.
