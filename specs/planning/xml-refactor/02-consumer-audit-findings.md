<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# `cuems-frontend` — the consumer-audit findings that are this repository's

**Vendored** 2026-09-25 from `cuems-utils/specs/planning/xml-rebuild/xml-rebuild-09-consumer-audit.md`
(measured 2026-09-03). Three of the audit's twelve findings are this repository's: **C3**, **C5** and
**C8**.

---

## C8 — this repository has no test coverage where the feature works hardest

Counted 2026-09-03: **112** `.ts` files, **5** `.spec.ts` files — `app.component`,
`components/design`, `components/ui/icon`, `components/layout/app-footer`,
`components/layout/app-header`.

**Re-counted 2026-10-02** on this branch's base (`feat/node-adoption-ui` @ `13d93b7`, which contains the
real `origin/main` @ `8d67d08`): **118** `.ts` files, **6** of them specs — `core/utils.spec.ts` was added
on `origin/main`. (The 2026-09-25 count of 117/5 was taken on `c69dc1c`, a stale tracking ref.)

The three files this feature rewrites — `project-edit/sequence/sequence.component.ts` (1739 lines),
`projects.service.ts` (696) and `settings.component.ts` (269) — still have **no spec between them**. The
settings component is now the adoption/liveness tier's (`03-migration-inventory.md` §4a); its
characterization tests pin that behaviour.

**This is the finding D35 exists to answer**, and it is the one to state first in the spec, because it
is what makes every other acceptance criterion in this feature meaningful. A green suite here evidences
nothing about the blast radius; "the tests pass" is not an exit criterion until the tests touch the
code.

---

## C5 — the template inventory undercounts, in files and in kind

Two undercounts, and the second is the more serious.

**In files**: four consuming files, not two. `projects.service.ts`,
`handlers/project-create.handler.ts`, `project-edit.component.ts` and
`project-edit/sequence/sequence.component.ts` (five sites in that last one alone). Since editor 001 none
of them is fed: `initial_template` is no longer sent (`04-wire-contract.md` §8).

**In kind**: **three** of them read *concrete values*, not two — and one of the three is not a field
default at all. `getTemplateOutputStructure` needs a constructible instance of a **whole nested complex
type** (`output_geometry`, `canvas_region`, the mapping shape), which is a different capability from
"the default for this field".

That distinction is what forced upstream's clarification **Q2**, answered *yes*: the descriptor emits,
per complex type, a constructible empty instance. It is recorded upstream as a **deliberate exception**
— the only descriptor change feature 010 sanctioned — precisely because this site could not be served
any other way without reintroducing the drift the cutover exists to end.

**Measured 2026-10-02**: the instances exist (`script:AudioCueOutputsType`, `script:VideoCueOutputsType`,
with `output_geometry` and `canvas_region`), but they are **not in wire shape** — no `CueOutput`
wrapper, `channels` nested as `{"channel": [...]}` where the wire has `[{"channel": {...}}]`, every
scalar `null`. Q2's capability therefore does not yet serve this site as-is; that is an upstream report
to `cuems-utils` (`03-migration-inventory.md` §2c).

### What this pass adds to C5

Three corrections, all measured (details in `03-migration-inventory.md` §2; lines on this branch's
base):

- **`getTemplateOutputStructure` has three call sites** (`:1075`, `:1411`, `:1452`), not one. Upstream
  names its definition only (`:1646`).
- **The `|| 20` fallback appears three times** (`:703`, `:508`, `:1003`), not once.
- **The value it diverges from is `100`**, a **model-layer** default (`cuems-utils`
  `src/cuemsutils/cues/AudioCue.py:9`), and confirmed 2026-10-02 as the descriptor's default for
  `script:AudioCueType.master_vol` — there is no XSD `default` attribute. So an XSD-only descriptor could
  not have answered this question, which is the concrete justification for D25's "defaults are not
  optional".

---

## C3 — the shared context block's HARD CONSTRAINT contradicts 008

The cross-repo context block asserted the `project_load` payload stays **unconditionally
byte-identical**. Two landed decisions make that false: 006's `to_wire()` drops `schemaLocation`, and
008's D17/D18b wraps `Media.duration`.

**Resolution**: an **enumerated delta list**, not unconditional identity. It was two deltas until
2026-10-01; `cuems-utils` 013 added (c) (`Cue` / `CueOutput` with `class`) and the editor sanctioned (d)
(video `opacity` default) on 2026-10-02. See [`04-wire-contract.md`](04-wire-contract.md) §2.
`doc_version` is **not** a delta — verified here, `grep -rn 'doc_version' src/` returns nothing.

**C3's operative consequence for this repository** that is a straight deletion:
`projects.service.ts:146`'s `schemaLocation: string;` is a **non-optional** interface property describing
a key that is absent. Nothing reads it (verified 2026-10-02), so nothing breaks — but an interface that
describes an absent key is how the next reader concludes the key is still there.

---

## The findings that are *not* this repository's

For orientation, so nothing is picked up by mistake:

| | Finding | Owner | State 2026-10-02 |
|---|---|---|---|
| C1 | a sixth consumer, unlisted everywhere, already silently wrong | `cuems-power-bridge` (audited as `cuems-wsclient` — the same repository renamed) | **landed** |
| C2 | `cuems-editor` does not start against the current branch | `cuems-editor` | **closed** (editor `5b8791c`, 2026-10-02) |
| **C3** | the HARD CONSTRAINT contradicts 008 | `cuems-editor` / **`cuems-frontend`** | resolved as the **four**-delta statement; **one deletion open here** |
| C4 | the descriptor has no public import path | `cuems-utils` | closed upstream; `cuems-editor` now serves it as `schema_descriptor` |
| **C5** | the template inventory undercounts | **`cuems-frontend`** | **open** |
| C6 | the Avahi TXT vocabulary has two owners | `cuems-nodeconf` + `cuems-common` | **landed** |
| C7 | the release gate has one enforced edge | `cuems-engine` + the packaged consumers | open — **not reachable here**, this repository is not packaged (`03-migration-inventory.md` §7) |
| **C8** | no coverage where the feature works hardest | **`cuems-frontend`** | **open** |
| C9 | three stale documents that are 010's own inputs | `cuems-utils` | closed |
| C10 | work landed after 008 closed, in no plan | `cuems-nodeconf` | **landed** |
| C11 | a third document-distribution surface | `cuems-engine` (major) / `cuems-editor` (minor) | open |
| C12 | the zero-`node_type` criterion cannot pass as written | `cuems-utils` | open |
