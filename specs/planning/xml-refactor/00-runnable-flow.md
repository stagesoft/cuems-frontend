<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# `cuems-frontend` — the runnable flow for `001-schema-descriptor-migration`

**Derived** 2026-09-25 from `cuems-utils/specs/planning/xml-rebuild/010-consumer-prompts/05-cuems-frontend.md`,
re-verified against the live tree. Where the two differ, **this file is the one to run**; the upstream
original is a dated 2026-09-03 record and is not edited.

**Feature name**: `001-schema-descriptor-migration` (this repository has no `specs/` features yet).
**Branch**: `feat/xml-refactor`, matching every other repository in this work.

The largest single port in the consumer set, in the repository with the least test coverage. That
combination is why D35 puts characterization tests before anything else.

---

## 0. State of this repository, measured 2026-09-25

| | |
|---|---|
| Current branch | `main` @ `c69dc1c` (2026-05-14), **in sync with `origin/main`**, clean |
| Base for `feat/xml-refactor` | **`main`** |
| Spec-kit | **absent** — added on first run, §1 |
| Constitution | **absent** — written on first run, §2 |
| `CLAUDE.md` | **absent** — the only repository in this work without one |
| Existing features | none → this becomes **`001-schema-descriptor-migration`** |
| Stack | Angular 19.2, Tailwind 4.1, `osc-js`, `@ngx-translate`; package name `formitgo-tw`, version `0.0.0` |
| Tests | `npm test` (`ng test`) — **5 `.spec.ts` files against 112 other `.ts` files** (117 total) |
| `cuemsutils` | **none.** This repository consumes `cuems-editor`'s WS payloads, not the library |
| Packaged? | **no** — so no release-gate edge is possible here. The payload handshake is the gate instead |

**The three files this feature rewrites have no tests:**

| File | Lines | Spec? |
|---|---|---|
| `src/app/components/projects/project-edit/sequence/sequence.component.ts` | 1662 | no |
| `src/app/services/projects/projects.service.ts` | 640 | no |
| `src/app/components/settings/settings.component.ts` | 140 | no |

The five that exist cover `app.component`, `components/design`, `components/ui/icon`,
`layout/app-footer` and `layout/app-header`. A green suite here currently evidences **nothing** about
this feature's blast radius — finding C8.

---

## 1. Branch and bootstrap

```bash
cd /disk/Projects/StageLab/cuems-frontend
git checkout main && git pull --ff-only
git checkout -b feat/xml-refactor
```

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

**Consider writing a `CLAUDE.md`** while you are here. This is the only repository in the work without
one, and the constitution prompt below has to reconstruct from `README.md`, `package.json` and source
what every other repository's `CLAUDE.md` states directly.

---

## 2. Constitution — write one, this repository has none

```
/speckit.constitution

Establish the constitution for cuems-frontend, grounded in what this repository actually is.
It has no CLAUDE.md; read README.md, package.json, and src/app/services/projects/
projects.service.ts before writing anything.

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
  accident to leave unremarked: 5 spec files against 112 TypeScript files, with the three
  largest and most business-critical components untested. State the direction of travel and
  the gate that actually applies to NEW and CHANGED code, rather than a repository-wide rule
  that would be waived immediately.
- LOCALSTORAGE IS A CACHE, NEVER A SOURCE OF TRUTH. initial_template and initial_mappings are
  both cached there today; a cache that outlives a schema change is how a UI shows the wrong
  shape after an upgrade.

Include an accessibility or i18n principle only if this repository actually holds itself to
one — @ngx-translate is wired up, so i18n has a real claim; do not assert an a11y standard
nothing checks.

Do NOT weaken any rule to accommodate the port that follows. In particular: if the
constitution says changed code carries tests, the characterization work below is that rule
being honoured, not an exception to it.
```

---

## 3. Context block — paste verbatim into `/speckit.specify` and `/speckit.plan`

Everything below resolves **inside this repository**. That is the point of the bundle.

```
CONTEXT — read all four before writing anything. They are in this repository:
  specs/planning/xml-refactor/01-settled-decisions.md        the six decisions that bind this repo
  specs/planning/xml-refactor/02-consumer-audit-findings.md  C3, C5, C8 — this repo's three findings
  specs/planning/xml-refactor/03-migration-inventory.md      THE INVENTORY — re-verified 2026-09-25
  specs/planning/xml-refactor/04-wire-contract.md            THE PAYLOAD CONTRACT, consuming end

PHASE ZERO, BEFORE ANY PORT: characterization tests (D35). This repository has 5 spec files
across 112 TypeScript files, and none covers the three files this feature rewrites. Pin today's
behaviour FIRST, so the port is MEASURED rather than asserted — exactly what feature 008 did
before moving cuems-nodeconf's network-map logic, and the reason that swap had an acceptance
criterion at all. Minimum surface:
  - settings.component.ts's adopt/unadopt cycle: the emit shape
    ({action:'nodelist_modify', modify_action, value}) and the response subscription at :35.
  - the five projectTemplate() reads in project-edit/sequence/sequence.component.ts, INCLUDING
    all THREE getTemplateOutputStructure call sites (:1022, :1346, :1387) — capture what each
    produces from a representative template payload.
  - projects.service.ts's initial_template and initial_mappings handling, including the
    localStorage round trip and the nullable-payload paths.
THE RULE THAT MAKES THEM WORTH WRITING: run them against the new code unchanged. If you find
yourself editing a characterization test to accommodate the new API, STOP — that is the moment
the guarantee is lost. cuems-nodeconf ran its vendored yardstick byte-identical against the new
library and that is why its migration has evidence rather than an argument.
These same tests are what prove the domain untangling preserved behaviour. They are not overhead
ahead of the real work; they are the instrument the real work is measured with.

WHAT MUST BE TRUE WHEN DONE:

- The template call sites are on the descriptor. All FOUR consuming files, with the THREE
  value-reading sites on descriptor DEFAULTS.

- master_vol is decided at all THREE sites, not one. :688 (the template read), plus :502 and
  :965 which carry the same `|| 20`. Measured: the library's model-layer default is 100
  (cuems-utils/src/cuemsutils/cues/AudioCue.py:9), there is no XSD default attribute, and the
  current fallback diverges by a factor of five. Adopting the descriptor's answer is a BEHAVIOUR
  CHANGE FOR OPERATORS — say so in the spec rather than letting it arrive as a side effect.

- getTemplateOutputStructure's source of shape is DECIDED, not defaulted into. It needs a
  constructible instance of a whole nested complex type (output_geometry, canvas_region, the
  mapping shape), not a scalar default. Upstream's clarification Q2 answered YES — the descriptor
  emits a constructible empty instance per complex type, the one descriptor change feature 010
  sanctioned. CONFIRM it covers these three call sites before assuming it does; if it does not,
  that is an upstream report, not a local hand-authored seed. Falling through to `undefined` is
  not an option.

- dmx_channels' behaviour choice is made explicitly, against the live UI. The descriptor's
  default is None — an empty list, not a channel to copy — so preserving today's behaviour means
  keeping this component's own seed. Both are defensible; deciding by accident is not.

- The media-duration display unwraps the wrapper at BOTH sites:
    project-show/sequence/sequence.component.ts:194              (TypeScript)
    project-edit/sequence/sequence.component.html:134            (Angular template — easy to miss)
  Both render [object Object] post-008, and neither fails loudly: the object is truthy so the
  `|| '-'` fallback never fires. Copy the pattern the fade path already uses at
  project-edit/sequence/sequence.component.ts:506 and :980.

- The config-domain UI is PORTED, NOT REBUILT (D26). settings.component.ts (network_map
  adopt/unadopt), audio-mixer:80 and video-mixer:94 (initial_mappings) move onto a generic
  schema-form renderer WITH THEIR LOGIC PRESERVED. Adopt and unadopt must still work END TO END
  through the port — the chain terminates in a real daemon and operators use it today. The RPC
  response shape {'OK': bool, 'error'?: str} is a contract with this component. Phase zero's
  tests are how that is proven.

- The remaining three config domains become editable through the same renderer. settings,
  project_settings and project_mappings have no editing UI today; the renderer that serves
  network_map serves them, driven by the descriptor's enumerations and defaults. Verify against
  EVERY restricted enumeration and EVERY model-layer default the six schemas declare — not a
  hand-picked subset, and not only the three value-reading sites.

- The new per-domain views are NOT named after settings.component.ts's mistake. That file is
  named for the `settings` domain and edits network_map nodes; name the new views for the domain
  they actually edit.

- The network_map-inside-initial_mappings entanglement is untangled, in step with cuems-editor.
  Simultaneous across three components here, TWO of which read localStorage directly. Do not
  land either half alone, and say what invalidates a cache written before the upgrade.

- The repair report is RENDERED. cuems-editor forwards 008's structured LoadReport as a WS
  message; this repository shows it to the operator, INCLUDING the "file on disk is now stale"
  flag — without which "repaired again on every open" reads as a bug. The unrepairable case gets
  the document name, the failing field, AND a next step (restore from a backup, correct the field,
  or remove the document). cuemsutils deliberately cannot do this half; it has no UI channel.

- The payload-version handshake has a designed refusal path, not just a version check: what the
  operator sees and what they are told to do. This repository is not packaged, so this handshake
  is its ONLY compatibility gate (FR-108).

- projects.service.ts:120's unread, non-optional schemaLocation property is DELETED. Verified
  2026-09-25: one declaration, no template use, nothing reads it.

OPTIONAL, explicitly a follow-up and NOT a blocker: simplifying the `=== true || === 'True'`
dual-read at :492. The string boolean form has NOT changed, so this is cleanup, not migration —
and removing it would be a third wire delta the contract does not sanction.

CONSIDER, as a design option rather than a requirement: having cuems-editor serve PARTIAL
elements on demand — a script sub-object, a DB-backed duration query — rather than requiring
this repository to hold or compute full payloads client-side, if it simplifies the new config
and form entities. Weigh it in /speckit.plan; feature 008 deliberately did not fix it.

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
*alongside* the old one instead of replacing it. In a 1662-line component with no tests, that is the
likely outcome rather than a risk.

---

## 5. What `/speckit.clarify` must force

Two of these change **what the port produces**, not merely how, and upstream names them as the pair to
force out before planning.

1. **`getTemplateOutputStructure`'s source of shape.** The descriptor's constructible empty instance,
   or an explicit hand-authored seed in this component? Confirm the descriptor's capability covers all
   three call sites first — the answer depends on a fact, not a preference.
2. **Does `dmx_channels` keep its hard-coded seed?** The descriptor says empty; today's UI says
   `[{channel: 1, value: 0}]`. Decide against the live UI.
3. **Is adopting `master_vol = 100` acceptable to operators?** It is the library's declared default and
   the current 20 is a five-fold drift — but it is still a visible change to what a new audio cue does.
   And it is three sites, not one.
4. **What testing gate does the constitution set, and does phase zero satisfy it?** If the gate would
   be waived for these three files, it is the wrong gate — the constitution step above asks for an
   honest one, so do not let the spec quietly raise it and then waive it.
5. **What invalidates a `localStorage` cache written before the upgrade?** A version key, a clear on
   connect, or a migration. Two components read `initial_mappings` from it directly.
6. **What does the handshake refusal look like to an operator?** A version mismatch that silently
   renders nothing is not better than `[object Object]`.
7. **Is building the missing adoption/liveness UI tier in scope?** `03-migration-inventory.md` §4a: the
   editor and engine are ready to serve `nodelist_get`, `node_status`, `cluster_warning` and
   `nodeconf_available`, and **nothing in this repository asks for any of them**. This is new UI work,
   not a port, so D26's "migration, not greenfield" does not cover it and flow 05 was written before the
   cluster existed. In or out — but decided, because out means the ecosystem ships a three-tier
   liveness surface no operator can see.
8. **Does `nodeconf_available` render, and where?** It already arrives inside `initial_mappings` on the
   editor's base branch, and it belongs to **no schema** — so the descriptor cannot place it. It must not
   become a `project_mappings` form field.
9. **How do `online` and `node_status.alive` both stay visible?** ~30 s discovery versus sub-second
   ping/pong, and only the second is the signal the GO gate trusts. One "is this node up?" control on the
   adoption screen silently picks one, probably the staler.

---

## 6. Per-file scope, for `/speckit.plan`

```
- src/app/services/projects/projects.service.ts — :120 schemaLocation, :150 signal,
  :159/:162/:242-243 localStorage, :219 response types, :395/:420 reads, plus the new
  descriptor / config-save / repair-report message handling.
- src/app/services/projects/handlers/project-create.handler.ts — :10, :14, :17-23.
- src/app/components/projects/project-edit/project-edit.component.ts:141.
- src/app/components/projects/project-edit/sequence/sequence.component.ts — :687, :716, :850,
  :909, :1571; the value reads at :688, :726-727, :1570-1600; the three
  getTemplateOutputStructure calls at :1022, :1346, :1387; and :502 / :965's `|| 20`.
- src/app/components/projects/project-edit/sequence/sequence.component.html:134.
- src/app/components/projects/project-show/sequence/sequence.component.ts:194.
- src/app/components/settings/settings.component.ts — the whole file, ported and renamed;
  settings.component.html:162, :172 with it.
- audio-mixer.component.ts:80, video-mixer.component.ts:94.
- new: the generic schema-form renderer and the per-domain views.
- new: .spec.ts files for the three untested files (phase zero).
```

**Sequencing**: the port is gated on `cuems-utils` (the descriptor exists publicly — **already
closed**, finding C4) and on `cuems-editor` (it serves the descriptor, and accepts config-domain
saves — **open**). **The characterization tests are gated on nothing** and should start immediately:
they pin current behaviour, which requires none of the above.

**Constitution check**, against the constitution written in §2:

- *Consumer of a contract* — the two enumerated wire deltas are the whole change. Anything else that
  moves is a bug in `cuems-editor`'s half, not something to accommodate here.
- *Nothing is silent* — rendering the repair report is that principle's whole point, not a feature
  request.
- *`localStorage` is a cache* — an `initial_template` cached before this upgrade is exactly the
  stale-shape scenario it warns about. Say what invalidates it.
- *Testing* — whatever gate the constitution sets for changed code, phase zero satisfies it for the
  three files at issue. If the gate would otherwise be waived here, it is the wrong gate.

---

## 7. Exit criteria, measured

| | Criterion |
|---|---|
| 1 | `npm test` green, **including three new spec files that did not exist before** and that pin the behaviour this feature moved. Both commits recorded — the characterization commit **before** the port commit, checkable by date |
| 2 | Every template call site on the descriptor, with the three value-reading sites on its defaults |
| 3 | `getTemplateOutputStructure` and `dmx_channels` **decided explicitly**, with the decision and its reason recorded |
| 4 | Media duration **displayed** rather than `[object Object]`, at **both** sites including the HTML template |
| 5 | Adopt/unadopt working **end to end** through the ported UI — against the real daemon, not just compiling |
| 6 | The other three config domains editable through the same renderer, checked against **every** enumeration and **every** model-layer default the six schemas declare |
| 7 | The entanglement untangled **together with** `cuems-editor`'s half; neither landed alone; the cache-invalidation story stated |
| 8 | A repaired document producing a notification the operator **actually sees**, and an unrepairable one producing a named field plus a next step |
| 9 | `schemaLocation` deleted from the interface |
| 9a | The §4a tier decision **recorded either way** — and if in scope, `node_status.alive` and `online` both visible and labelled, with `nodeconf_available` rendered outside any `project_mappings` form |
| 10 | Items that could not be performed recorded as **not performed**, per entry. Silence is not an acceptable third state — the convention both landed siblings followed |

---

## 8. The candidate tag, and what it now waits on

When the exit criteria are met: `xml-refactor-merge-candidate`, annotated and **signed**, on
`feat/xml-refactor`. Three siblings have already cut theirs:

| Repository | Tag at | Carries |
|---|---|---|
| `cuems-power-bridge` | `d5c4226` | features 001 + 002 |
| `cuems-common` | `3af31cc` | the `node_role` conversion, the fixed `cuems-cluster-poweroff` |
| `cuems-nodeconf` | `6c0cca7` | its own two features |
| `cuems-utils` | — | **tags last, by decision** — it is the library everything here pins |

By the shared convention the tag moves **only** when a candidate is genuinely re-cut (packaged content
changes), and a re-cut is announced to the other flows.

**Nothing releases from this branch alone** (D27). And the whole-system tag waits on more than the
consumer flows: `cuems-utils` features **011–014** (`/etc/cuems` first install, uuid4 convergence, the
device-class reshape, `hardware_outputs`) are a hard successor, and the tag comes after them. Two of
those four reach this repository — **013** (the device-class reshape) touches four cue-type unions in
`project-edit/sequence/sequence.component.ts`, and **014** (`hardware_outputs`) moves the port
inventory this UI reads to a new place. Neither is in this feature's scope; both are reasons not to
treat this port as the last word on these files.

---

## 9. Traps

**A green suite means nothing here until phase zero lands.** That is finding C8 and it is the premise
of the whole flow.

**Do not edit a characterization test to make the new code pass.** That is the moment the guarantee is
lost. If the new API genuinely cannot produce what the old one did, that is a finding to record, not a
test to adjust.

**`grep` over `*.ts` misses Angular templates.** The second `Media.duration` site is in a `.html` file.
Any sweep for payload reads must cover `*.html` as well — and in this repository that also means
`settings.component.html`'s two `(confirm)` bindings, which are how the adopt/unadopt methods are
reached at all.

**`localStorage` survives everything.** It survives a rebuild, a reload and an upgrade. Two components
read `initial_mappings` from it directly, bypassing the service that would have re-fetched.

**Match names by segment, never by substring.** A sibling sweep reported all six schemas as show-layer
violations because `"cue" in "cuems"` is true. Relevant here for any generated per-domain view naming.

**Commits are GPG-signed.** On `gpg failed to sign`, retry — never `--no-gpg-sign`.

**Planning artefacts stay in `specs/planning/`; feature artefacts in `specs/001-*/`.** This bundle is
planning.
