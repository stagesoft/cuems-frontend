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

**Re-counted 2026-09-25**: unchanged. `find src -name '*.ts' | wc -l` → **117**, of which 5 are the
specs, so 112 non-spec files. Not drift; upstream's figure excluded the specs.

The three files this feature rewrites — `project-edit/sequence/sequence.component.ts` (1662 lines),
`projects.service.ts` (640) and `settings.component.ts` (140) — have **no spec between them**.

**This is the finding D35 exists to answer**, and it is the one to state first in the spec, because it
is what makes every other acceptance criterion in this feature meaningful. A green suite here evidences
nothing about the blast radius; "the tests pass" is not an exit criterion until the tests touch the
code.

---

## C5 — the template inventory undercounts, in files and in kind

Two undercounts, and the second is the more serious.

**In files**: four consuming files, not two. `projects.service.ts`,
`handlers/project-create.handler.ts`, `project-edit.component.ts` and
`project-edit/sequence/sequence.component.ts` (five sites in that last one alone).

**In kind**: **three** of them read *concrete values*, not two — and one of the three is not a field
default at all. `getTemplateOutputStructure` needs a constructible instance of a **whole nested complex
type** (`output_geometry`, `canvas_region`, the mapping shape), which is a different capability from
"the default for this field".

That distinction is what forced upstream's clarification **Q2**, answered *yes*: the descriptor emits,
per complex type, a constructible empty instance. It is recorded upstream as a **deliberate exception**
— the only descriptor change feature 010 sanctioned — precisely because this site could not be served
any other way without reintroducing the drift the cutover exists to end.

### What this pass adds to C5

Three corrections, all measured (details in `03-migration-inventory.md` §2):

- **`getTemplateOutputStructure` has three call sites** (`:1022`, `:1346`, `:1387`), not one. Upstream
  names its definition only.
- **The `|| 20` fallback appears three times** (`:688`, `:502`, `:965`), not once.
- **The value it diverges from is `100`**, declared at `cuems-utils/src/cuemsutils/cues/AudioCue.py:9`
  as a **model-layer** default — there is no XSD `default` attribute on `master_vol`. So an XSD-only
  descriptor could not have answered this question, which is the concrete justification for D25's
  "defaults are not optional".

---

## C3 — the shared context block's HARD CONSTRAINT contradicts 008

The cross-repo context block asserted the `project_load` payload stays **unconditionally
byte-identical**. Two landed decisions make that false: 006's `to_wire()` drops `schemaLocation`, and
008's D17/D18b wraps `Media.duration`.

**Resolution**: an **enumerated two-delta**, not unconditional identity. See
[`04-wire-contract.md`](04-wire-contract.md). `doc_version` is **not** a third delta — verified here,
`grep -rn 'doc_version' src/` returns nothing.

**C3's operative consequence for this repository** is the one thing in the audit that is a straight
deletion: `projects.service.ts:120`'s `schemaLocation: string;` is a **non-optional** interface property
describing a key that will be absent. Nothing reads it (verified 2026-09-25), so nothing breaks — but an
interface that describes an absent key is how the next reader concludes the key is still there.

---

## The findings that are *not* this repository's

For orientation, so nothing is picked up by mistake:

| | Finding | Owner | State 2026-09-25 |
|---|---|---|---|
| C1 | a sixth consumer, unlisted everywhere, already silently wrong | `cuems-power-bridge` (audited as `cuems-wsclient` — the same repository renamed) | **landed** |
| C2 | `cuems-editor` does not start against the current branch | `cuems-editor` | open |
| **C3** | the HARD CONSTRAINT contradicts 008 | `cuems-editor` / **`cuems-frontend`** | resolved as the two-delta statement; **one deletion open here** |
| C4 | the descriptor has no public import path | `cuems-utils` | closed upstream — this is what unblocked D25 here |
| **C5** | the template inventory undercounts | **`cuems-frontend`** | **open** |
| C6 | the Avahi TXT vocabulary has two owners | `cuems-nodeconf` + `cuems-common` | **landed** |
| C7 | the release gate has one enforced edge | `cuems-engine` + the packaged consumers | open — **not reachable here**, this repository is not packaged (`03-migration-inventory.md` §7) |
| **C8** | no coverage where the feature works hardest | **`cuems-frontend`** | **open** |
| C9 | three stale documents that are 010's own inputs | `cuems-utils` | closed |
| C10 | work landed after 008 closed, in no plan | `cuems-nodeconf` | **landed** |
| C11 | a third document-distribution surface | `cuems-engine` (major) / `cuems-editor` (minor) | open |
| C12 | the zero-`node_type` criterion cannot pass as written | `cuems-utils` | open |
