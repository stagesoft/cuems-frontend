<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# `cuems-frontend` — the runnable flow for `001-schema-descriptor-migration`

**Derived** 2026-09-25 from `cuems-utils/specs/planning/xml-rebuild/010-consumer-prompts/05-cuems-frontend.md`,
re-verified against the live tree. Where the two differ, **this file is the one to run**; the upstream
original is a dated 2026-09-03 record and is not edited.

**Amended 2026-10-02** after `cuems-utils` 013 completed and `cuems-editor` 001 was implemented, and
re-based onto `feat/node-adoption-ui`. What changed and why: `05-amendment-2026-10-02.md`.

**Feature name**: `001-schema-descriptor-migration` (this repository has no `specs/` features yet).
**Branch**: `feat/xml-refactor`, matching every other repository in this work.

The largest single port in the consumer set, in the repository with the least test coverage. That
combination is why D35 puts characterization tests before anything else.

---

## 0. State of this repository, measured 2026-10-02

| | |
|---|---|
| Current branch | **`feat/xml-refactor`** @ `0f3a522` — this bundle's one commit, **rebased 2026-10-02** onto `feat/node-adoption-ui` |
| Base | **`origin/feat/node-adoption-ui`** @ `13d93b7` (2026-09-04, unmerged) = `origin/main` @ `8d67d08` (2026-08-11) **+ 4 commits**: the adoption/liveness UI tier (`03-migration-inventory.md` §4a) |
| Earlier base, superseded | `c69dc1c` (2026-05-14). The 2026-09-25 "in sync with `origin/main`" was measured against an unfetched tracking ref; the real `origin/main` was 23 commits ahead |
| Spec-kit | **absent** — added on first run, §1 |
| Constitution | **absent** — written on first run, §2 |
| `CLAUDE.md` | **present** (`ef6571a`, on `origin/main`) |
| Existing features | none → this becomes **`001-schema-descriptor-migration`** |
| Stack | Angular 19.2, Tailwind 4.1, `osc-js`, `@ngx-translate`; package name `formitgo-tw`, version `0.0.0` |
| Tests | `npm test` (`ng test`) — **6 `.spec.ts` files against 112 other `.ts` files** (118 total) |
| `cuemsutils` | **none.** This repository consumes `cuems-editor`'s WS payloads, not the library |
| Packaged? | **no** — so no release-gate edge is possible here. The payload handshake is the gate instead |
| Producing end | `cuems-editor` `feat/xml-refactor` @ `8247e9b` (001, milestones 1 and 2), on `cuemsutils` `0.1.0rc16` @ `6213b16` (013 complete). Its frame list: `../cuems-editor/tests/ws-command-responses.txt` |

**The three files this feature rewrites have no tests:**

| File | Lines | Spec? |
|---|---|---|
| `src/app/components/projects/project-edit/sequence/sequence.component.ts` | 1739 | no |
| `src/app/services/projects/projects.service.ts` | 696 | no |
| `src/app/components/settings/settings.component.ts` | 269 | no |

The six that exist cover `app.component`, `core/utils`, `components/design`, `components/ui/icon`,
`layout/app-footer` and `layout/app-header`. A green suite here currently evidences **nothing** about
this feature's blast radius — finding C8.

---

## 1. Branch and bootstrap

The branch exists and is already on its base:

```bash
cd /disk/Projects/StageLab/cuems-frontend
git fetch
git checkout feat/xml-refactor        # 0f3a522, on origin/feat/node-adoption-ui 13d93b7
git log --oneline origin/feat/node-adoption-ui..HEAD   # expect exactly the bundle commit(s)
```

If `feat/node-adoption-ui` moves before this flow starts, rebase onto it again. If it is merged to
`main` first, rebase onto `main`; either way the tier's four commits must be underneath this feature.

### The spec-kit bootstrap has a version problem — resolve it before running

Spec-kit is not installed here. The upstream flow says:

```bash
specify init --here --integration claude --script sh --force
```

**Measured 2026-09-25**: the `specify` CLI on this development machine is **0.16.2**, while the three
landed sibling repositories (`cuems-common`, `cuems-nodeconf`, `cuems-power-bridge`) were all
bootstrapped with **1.0.4** — see any of their `.specify/init-options.json`. `cuems-utils` itself was
initialized earlier still, at `0.5.1.dev0`.

So running the command above as-is produces a scaffold that differs from every sibling's. Three
options; record the choice rather than defaulting into it:

| | Option | Cost |
|---|---|---|
| (a) | Upgrade the CLI to ≥ 1.0.4, then `specify init` | The stated intent — the repositories stay comparable. Needs network |
| (b) | Copy `.specify/{scripts,templates,workflows,integration.json,init-options.json}` from `../cuems-nodeconf` (verified **byte-identical** to `../cuems-power-bridge`'s for `scripts` and `templates`), install the `.claude/skills/speckit-*` set to match its `integrations/claude.manifest.json` hashes, and leave `memory/constitution.md` as the unfilled template for §2 | Offline-safe and matches the siblings, but the manifest's `installed_at` and hashes must be made honest, not copied verbatim |
| (c) | `specify init` at 0.16.2 and accept the divergence | Cheapest, and it makes "the repositories stay comparable" false. If chosen, say so in the spec |

**Commit the scaffold as its own commit** before `/speckit.constitution` — GPG-signed, per the
standing rules.

Spec-kit's sequential branch numbering will want its own branch. **Stay on `feat/xml-refactor`**; let
it name `specs/001-schema-descriptor-migration/` only.

`CLAUDE.md` already exists; read it before §2, and add a field note for whatever this feature changes.

---

## 2. Constitution — write one, this repository has none

```
/speckit.constitution

Establish the constitution for cuems-frontend, grounded in what this repository actually is.
Read CLAUDE.md, README.md, package.json, and src/app/services/projects/projects.service.ts
before writing anything.

WHAT THIS REPOSITORY IS: the Angular 19 browser UI for CueMS, package name formitgo-tw.
Tailwind 4 for styling, @ngx-translate for i18n, osc-js on the wire alongside a WebSocket
connection to cuems-editor on :9092. It is the operator's entire view of the system: project
editing (the sequence editor), media management, audio/video mixers, and node adoption. It
holds no database and no files; every piece of state it shows arrives over the WS connection
or is cached in localStorage.

PRINCIPLES THE CODE ALREADY IMPLIES — derive from these, do not invent unrelated ones:
- IT IS A CONSUMER OF A CONTRACT IT DOES NOT OWN. Payload shape comes from cuems-editor,
  which comes from cuemsutils' schemas. This repository cannot change that contract; it can
  only track it. Defensive reads of payload fields are correctness, not paranoia — note that
  the existing code already reads booleans as `=== true || === 'True'` for exactly this
  reason.
- STATE ARRIVES ASYNCHRONOUSLY AND PARTIALLY. Signals hold nullable payloads; localStorage
  holds stale ones. A component that assumes a payload is present, complete, or fresh is
  the recurring bug shape here.
- IT IS THE ONLY PLACE A HUMAN SEES ANYTHING. When the backend repairs a corrupt document or
  refuses to load one, this repository is where that becomes visible or is lost. Silence is
  a failure mode with a user attached.
- COMPONENTS ARE LARGE AND UNDER-TESTED, and that is a stated position rather than an
  accident to leave unremarked: 6 spec files against 112 TypeScript files, with the three
  largest and most business-critical components untested. State the direction of travel and
  the gate that actually applies to NEW and CHANGED code, rather than a repository-wide rule
  that would be waived immediately.
- LOCALSTORAGE IS A CACHE, NEVER A SOURCE OF TRUTH. initial_template and initial_mappings are
  both cached there today; a cache that outlives a schema change is how a UI shows the wrong
  shape after an upgrade. The editor no longer sends initial_template at all, so its cached
  copy is never refreshed.
- TWO LIVENESS FACTS, NEVER ONE. A node's `online` (discovery, ~30 s) and `node_status.alive`
  (sub-second, what the GO gate trusts) are shown apart. The adoption screen this branch is
  based on already does this; the constitution should say why.

Include an accessibility or i18n principle only if this repository actually holds itself to
one — @ngx-translate is wired up, so i18n has a real claim; do not assert an a11y standard
nothing checks.

Do NOT weaken any rule to accommodate the port that follows. In particular: if the
constitution says changed code carries tests, the characterization work below is that rule
being honoured, not an exception to it.
```

---

## 3. Context block — paste verbatim into `/speckit.specify` and `/speckit.plan`

Everything below resolves **inside this repository**, plus the producing end's frame list
`../cuems-editor/tests/ws-command-responses.txt`. Line numbers are on this branch's base,
`feat/node-adoption-ui` @ `13d93b7`.

```
CONTEXT — read all five before writing anything. They are in this repository:
  specs/planning/xml-refactor/01-settled-decisions.md        the six decisions that bind this repo
  specs/planning/xml-refactor/02-consumer-audit-findings.md  C3, C5, C8 — this repo's three findings
  specs/planning/xml-refactor/03-migration-inventory.md      THE INVENTORY — re-verified 2026-10-02
  specs/planning/xml-refactor/04-wire-contract.md            THE PAYLOAD CONTRACT, consuming end
  specs/planning/xml-refactor/05-amendment-2026-10-02.md     what changed since 2026-09-25, and why

THE PRODUCING END HAS LANDED ITS HALF. cuems-editor 001 (feat/xml-refactor @ 8247e9b) serves
the new wire today, on cuemsutils 0.1.0rc16 @ 6213b16 with feature 013 (device-class reshape)
complete. Nothing has shipped; this repository ships with it under the coordinated tag (D27).

PHASE ZERO, BEFORE ANY PORT: characterization tests (D35). This repository has 6 spec files
across 112 TypeScript files, and none covers the three files this feature rewrites. Pin today's
behaviour FIRST, so the port is MEASURED rather than asserted — exactly what feature 008 did
before moving cuems-nodeconf's network-map logic. Minimum surface:
  - settings.component.ts as feat/node-adoption-ui left it: the adopt/unadopt emit
    ({action:'nodelist_modify', modify_action, value}, :248-269) and its response subscription
    (:99); the node_status poll (:113, :159); the two presence badges (:163-176); the
    nodeconf_available greying (:41-42).
  - the five projectTemplate() reads in project-edit/sequence/sequence.component.ts (:702, :731,
    :875, :947, :1647), INCLUDING all THREE getTemplateOutputStructure call sites (:1075, :1411,
    :1452) — capture what each produces from a representative template payload.
  - the save wrapper (:1141) and the cue-type ladder (:962-978): what each cue type produces.
  - projects.service.ts's initial_template and initial_mappings handling, including the
    localStorage round trip and the nullable-payload paths.
FEED THEM RECORDED PAYLOADS, not invented ones: ../cuems-editor/specs/001-cuems-utils-migration/
evidence/ holds the pre-001 project frame, initial_mappings and initial_template.
THE RULE THAT MAKES THEM WORTH WRITING: run them against the new code unchanged. If you find
yourself editing a characterization test to accommodate the new API, STOP — that is the moment
the guarantee is lost. Where the WIRE changed (the four project deltas, the node_list split),
the test's INPUT fixture changes to the new recorded payload; its EXPECTED behaviour does not.

WHAT MUST BE TRUE WHEN DONE:

- Saving works against the 001 editor. Hardware cues are written as {"Cue": {..., "class"}} and
  their outputs as {"CueOutput": {..., "class"}} (cuems-utils 013, delta (c)): the save wrapper
  (:1141), the ladder (:962-978), the read side (:238-239, :1201), the output reads (:349, :353,
  :915), project-show/sequence/sequence.component.ts:117-154 and shared/audio-mixer :61, :63.
  Measured: the editor's library accepts an AudioCue-keyed payload on ingest and then REFUSES it
  at save, so today's UI cannot save at all. An unknown class is not an error.

- The template call sites are on the descriptor (schema_descriptor; initial_template is no longer
  sent). All FOUR consuming files, with the THREE value-reading sites on descriptor DEFAULTS.

- master_vol is decided at all THREE sites, not one: :703 (the template read), :508 and :1003. The
  descriptor's default is 100 (measured: script:AudioCueType), the current fallback is 20.
  Adopting 100 is a BEHAVIOUR CHANGE FOR OPERATORS — say so in the spec.

- getTemplateOutputStructure's source of shape is DECIDED, not defaulted into. MEASURED
  2026-10-02: the descriptor's per-type instances exist (script:AudioCueOutputsType,
  script:VideoCueOutputsType, with output_geometry and canvas_region) but are NOT in wire shape —
  no CueOutput wrapper, channels as {"channel": [...]} where the wire has [{"channel": {...}}],
  every scalar null. File the upstream report to cuems-utils before planning; do not hand-author
  a local seed, and do not let any call site fall through to undefined.

- dmx_channels' behaviour choice is made explicitly, against the live UI. The descriptor's
  default is None (measured) — an empty list, not a channel to copy.

- The media-duration display unwraps the wrapper at BOTH sites:
    project-show/sequence/sequence.component.ts:197                      (getCueDuration)
    project-edit/sequence/sequence.component.ts:1256                     (getCueMediaDuration,
                                                                          rendered by .html:134)
  Both render [object Object]; neither fails loudly. Copy the fade path at :519 and :1024.

- The mapping reads follow 013's shape: defaults[].default with class / direction and the port
  under "&" (replacing default_audio_output / default_video_output: projects.service.ts:39, :41;
  sequence.component.ts:385, :455, :697, :698), and node.devices[].device by class (replacing
  node.audio / node.video in audio-mixer :129 and video-mixer :107).

- The config-domain UI is PORTED, NOT REBUILT (D26). settings.component.ts — as
  feat/node-adoption-ui left it — keeps adopt/unadopt working END TO END against the real daemon;
  the RPC response shape {'OK': bool, 'error'?: str} is a contract. Its node list and
  nodeconf_available now come from the node_list frame, not initial_mappings, and node booleans
  are "True"/"False": :176's `online === true` must become the dual read.

- The other config domains: settings, project_settings and project_mappings have no editing UI.
  The renderer that would serve them is BLOCKED UPSTREAM for saving: the editor's config_save
  answers an error for all four config domains until cuemsutils has public JSON ingestion for
  config documents (cuems-editor UR-5). Decide whether this feature builds read-only views, or
  records the item as not performed. Adoption stays nodelist_modify either way.

- The new per-domain views are NOT named after settings.component.ts's mistake.

- The network_map-inside-initial_mappings entanglement is untangled. The editor's half has
  LANDED (initial_mappings = mapping document only; node_list = nodes, new_nodes,
  nodeconf_available). Move the three consumers here together, and state what invalidates a
  localStorage cache written before the upgrade — it now holds an old SHAPE, not just an old split.

- The repair report is RENDERED AND ACKNOWLEDGED. document_load_report after every project frame,
  including file_differs_from_loaded; document_load_failed with the document, the field and all
  three next_steps. The editor REFUSES project_save of a converted/repaired project
  (repair_save_refused, reason "unacknowledged") until this session sends repair_acknowledge with
  that report_id — without that step such projects cannot be saved. "preserve_failed" means
  nothing was written.

- network_map_error (a duplicate node identity) is shown on the adoption screen.

- The payload-version handshake has a designed refusal path. The editor sends
  {"type":"payload_version","value":1} first on every connection; this repository decides what
  the operator sees on a mismatch. This repository is not packaged, so it is its ONLY gate.

- projects.service.ts:146's unread, non-optional schemaLocation property is DELETED, and no save
  sends the key back (the editor refuses such a payload).

OPTIONAL, explicitly a follow-up and NOT a blocker: simplifying the `=== true || === 'True'`
dual-read at :498. The string boolean form has NOT changed — and now reaches node fields too.

CONSIDER, as a design option rather than a requirement: having cuems-editor serve PARTIAL
elements on demand rather than requiring this repository to hold or compute full payloads
client-side. Weigh it in /speckit.plan.

DO NOT re-implement or re-test the node model here (007 FR-030a-i). It lives in cuemsutils
exclusively, reached through cuems-editor's wire. A node-model test appearing here is a
regression, not coverage.
```

---

## 4. The chain

```
/speckit.specify   <paste §3>
/speckit.clarify                 <- do NOT skip; §5
/speckit.plan      <paste §3>    <- plus the per-file scope in §6
/speckit.tasks
/speckit.check-integration       <- earns its place here more than anywhere
/speckit.optimize
/speckit.implement               <- never on a red suite
/speckit.verify
```

**`check-integration` matters most in a migration**: the failure mode is writing the new call
*alongside* the old one instead of replacing it. In a 1739-line component with no tests, that is the
likely outcome rather than a risk.

---

## 5. What `/speckit.clarify` must force

1. **`getTemplateOutputStructure`'s source of shape.** *Measured 2026-10-02*: the descriptor's instance
   exists but is not wire-shaped (§3, `03-migration-inventory.md` §2c). Ask: wait for the upstream fix,
   or adapt the instance through a documented transform? Not a hand-authored seed.
2. **Does `dmx_channels` keep its hard-coded seed?** The descriptor says empty (measured); today's UI
   says `[{channel: 1, value: 0}]`. Decide against the live UI.
3. **Is adopting `master_vol = 100` acceptable to operators?** Measured as the descriptor's default.
   Three sites, not one.
4. **What testing gate does the constitution set, and does phase zero satisfy it?**
5. **What invalidates a `localStorage` cache written before the upgrade?** A version key (the payload
   version is a natural one), a clear on connect, or a migration. Two components read `initial_mappings`
   from it directly, and it now holds an old shape.
6. **What does the handshake refusal look like to an operator?**
7. **The adoption/liveness tier — answered in code.** `feat/node-adoption-ui`, this branch's base,
   built it (`03-migration-inventory.md` §4a). Confirm it is in this feature's scope as a *port*: carry
   it across the `node_list` split and the string booleans, and pin it in phase zero.
8. **Where does `nodeconf_available` render?** Answered by both ends: the editor sends it on
   `node_list`, outside any document; the tier greys the adopt controls with it. Confirm the treatment
   of an absent flag (`!== false` today makes "absent" mean "available").
9. **How do `online` and `node_status.alive` both stay visible?** Answered by the tier: two badges.
   Keep them apart through the port.
10. **What does the acknowledge step look like?** The editor refuses saves of a repaired or converted
    project until the session acknowledges its report. Where is the report shown, what does the
    operator confirm, and what happens on `preserve_failed`?
11. **How is a cue of an unknown `class` shown?** The vocabulary is open (013); a project may carry a
    class this UI has no editor for.
12. **The three unedited config domains**: read-only views now, or not performed until `cuems-utils`
    publishes JSON ingestion (UR-5)?

---

## 6. Per-file scope, for `/speckit.plan`

```
- src/app/services/projects/projects.service.ts — :39/:41 default_*_output, :146 schemaLocation,
  :152 nodeconf_available, :182 signal, :209/:217-227/:293/:298-312 localStorage, :269 response
  types, :290-293 intake, :451/:476 reads; plus payload_version, node_list, schema_descriptor,
  document_load_report / _failed, repair_acknowledge / repair_save_refused, network_map_error.
- src/app/services/projects/handlers/project-create.handler.ts — :10, :17 (called :53, :55).
- src/app/components/projects/project-edit/project-edit.component.ts:151.
- src/app/components/projects/project-edit/sequence/sequence.component.ts — template reads :702,
  :731, :875, :947, :1647; value reads :703, :741-753, :1646; the three getTemplateOutputStructure
  calls :1075, :1411, :1452; :508 / :1003's `|| 20`; cue keys :238-239, :349, :353, :915,
  :962-978, :1141, :1201; defaults :385, :455, :697-698; duration :1046, :1256.
- src/app/components/projects/project-edit/sequence/sequence.component.html:134.
- src/app/components/projects/project-show/sequence/sequence.component.ts — :117-154, :197.
- src/app/components/projects/shared/audio-mixer/audio-mixer.component.ts — :61, :63.
- src/app/components/settings/settings.component.ts — the whole file (the adoption tier), ported
  and renamed; settings.component.html :236, :246 with it.
- project-show/audio-mixer.component.ts :115/:129, video-mixer.component.ts :94/:107.
- new: the schema-form renderer and the per-domain views; the repair-report and acknowledge UI;
  the handshake refusal.
- new: .spec.ts files for the three untested files (phase zero).
```

**Sequencing**: `cuems-utils` serves the descriptor publicly (C4, closed) and 013 is complete.
`cuems-editor` serves the descriptor, the split node list, the repair report, the save gate and the
handshake on its `feat/xml-refactor` — **landed, not shipped**. Still open upstream: config-domain saves
(UR-5) and a wire-shaped descriptor instance (§3). **The characterization tests are gated on nothing**
and should start immediately: they pin current behaviour, which requires none of the above.

**Constitution check**, against the constitution written in §2:

- *Consumer of a contract* — the four enumerated `project` deltas and the payload-version-1 frames
  (`04-wire-contract.md`) are the whole change. Anything else that moves is a bug in `cuems-editor`'s
  half, not something to accommodate here.
- *Nothing is silent* — rendering the repair report, and the acknowledge step the editor now requires,
  are that principle's whole point.
- *`localStorage` is a cache* — an `initial_template` cached before this upgrade is never refreshed, and
  `initial_mappings` changes shape. Say what invalidates both.
- *Testing* — whatever gate the constitution sets for changed code, phase zero satisfies it for the
  three files at issue. If the gate would otherwise be waived here, it is the wrong gate.

---

## 7. Exit criteria, measured

| | Criterion |
|---|---|
| 1 | `npm test` green, **including three new spec files that did not exist before** and that pin the behaviour this feature moved. Both commits recorded — the characterization commit **before** the port commit, checkable by date |
| 2 | A project with audio, video and DMX cues **opens and saves** against the 001 editor: cues written as `Cue` / `CueOutput` with `class` |
| 3 | Every template call site on the descriptor, with the three value-reading sites on its defaults |
| 4 | `getTemplateOutputStructure` and `dmx_channels` **decided explicitly**, with the decision and its reason recorded (including the upstream report on the instance shape) |
| 5 | Media duration **displayed** rather than `[object Object]`, at **both** sites (`project-show/…:197`, `project-edit/…:1256`) |
| 6 | Adopt/unadopt working **end to end** through the ported UI — against the real daemon — with nodes and `nodeconf_available` from `node_list`, both presence badges correct for `"True"` / `"False"` |
| 7 | The mixers and default-output reads working on 013's `devices` / `defaults` shape |
| 8 | The other three config domains: built, or recorded **not performed** with UR-5 as the reason |
| 9 | The entanglement untangled **together with** `cuems-editor`'s half; the cache-invalidation story stated |
| 10 | A repaired document producing a report the operator **actually sees**, an acknowledge step after which the save succeeds, and an unrepairable one producing a named field plus the three next steps |
| 11 | The handshake refusal designed and demonstrated against a version other than 1 |
| 12 | `schemaLocation` deleted from the interface |
| 13 | Items that could not be performed recorded as **not performed**, per entry. Silence is not an acceptable third state — the convention the landed siblings followed |

---

## 8. The candidate tag, and what it now waits on

When the exit criteria are met: `xml-refactor-merge-candidate`, annotated and **signed**, on
`feat/xml-refactor`. State of the siblings, `git rev-parse xml-refactor-merge-candidate`, 2026-10-02:

| Repository | Tag at | Notes |
|---|---|---|
| `cuems-power-bridge` | `399baf7` (2026-09-29) | |
| `cuems-common` | `e3c9430` (2026-09-28) | |
| `cuems-nodeconf` | `5be6cf0` (2026-09-30) | |
| `cuems-engine` | `1662a99` (2026-10-01) | cut, not pushed |
| `cuems-editor` | — | 001 implemented; its tag message is written and marked **not ready until this flow lands** |
| `cuems-utils` | — | **tags last, by decision** |

By the shared convention the tag moves **only** when a candidate is genuinely re-cut, and a re-cut is
announced to the other flows. The editor's tag message also names `feat/node-adoption-ui`'s siblings
(`cuems-editor` `feat/nodelist-adoption-api`, `cuems-engine` `feat/nodelist-modify-dispatch`) as
included; this repository's tag should name `feat/node-adoption-ui` the same way, since it lands
through this feature.

**Nothing releases from this branch alone** (D27). `cuems-utils` features **011, 012 and 013 are
complete**; **014** (`hardware_outputs`) is not yet specified, and the whole-system tag comes after it.
013 is **inside** this feature (its wire is delta (c) and the mapping shape). 014 moves the port
inventory this UI reads to a new place; it is not in this feature's scope and is the reason not to treat
the mapping reads ported here as final.

---

## 9. Traps

**A green suite means nothing here until phase zero lands.** That is finding C8 and it is the premise
of the whole flow.

**Do not edit a characterization test to make the new code pass.** That is the moment the guarantee is
lost. If the new API genuinely cannot produce what the old one did, that is a finding to record, not a
test to adjust.

**`grep` over `*.ts` misses Angular templates.** Any sweep for payload reads must cover `*.html` as well
— in this repository that means `sequence.component.html:134` (it renders the second `Media.duration`
site through a method) and `settings.component.html`'s two `(confirm)` bindings (`:236`, `:246`), which
are how the adopt/unadopt methods are reached at all.

**Measure against a fetched remote.** The 2026-09-25 pass called `main` "in sync with `origin/main`"
from an unfetched tracking ref and was 23 commits behind. `git fetch` before quoting a line number.

**`localStorage` survives everything.** It survives a rebuild, a reload and an upgrade. Two components
read `initial_mappings` from it directly, bypassing the service that would have re-fetched.

**Match names by segment, never by substring.** A sibling sweep reported all six schemas as show-layer
violations because `"cue" in "cuems"` is true. Relevant here for any generated per-domain view naming.

**Commits are GPG-signed.** On `gpg failed to sign`, retry — never `--no-gpg-sign`.

**Planning artefacts stay in `specs/planning/`; feature artefacts in `specs/001-*/`.** This bundle is
planning.
