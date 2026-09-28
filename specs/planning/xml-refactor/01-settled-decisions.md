<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# The settled decisions that bind `cuems-frontend`

**Vendored** 2026-09-25 from `cuems-utils/specs/planning/xml-rebuild/xml-rebuild-07-speckit-prompts.md`
§2, which is authoritative for the full list of thirty-six (D1–D36, plus Q11→(c) and Q14→(i)).

**Do not reopen any of these.** If a question arises that this subset does not answer, read §2 upstream
rather than inventing an answer locally — and if a decision changes, it changes there first and
propagates here, never the reverse.

---

## The six that bind this repository

| | Decision |
|---|---|
| **D25** | Template/config generation moves onto a schema-derived descriptor covering all six schemas, emitting per type: field name, XSD type, cardinality, restricted `xs:enumeration` values, **and model-layer defaults**. Defaults are **not optional** — two of this repository's template call sites consume *values*, not shape |
| **D26** | `initial_template`-as-a-concrete-instance is retired. The script domain is a **migration** of this repository's template call sites. The config domain is **also a migration, not a greenfield build** — a `network_map` editing UI exists and is **in daily use** (`settings.component.ts`, `nodelist_modify` adopt/unadopt), and `project_mappings` has read consumers (audio-mixer, video-mixer). Port the existing machinery onto dynamic-form entities **with its logic preserved**. Adopt/unadopt must keep working through the port |
| **D35** | This port is **preceded by characterization tests** of the three files it rewrites — mirroring exactly what feature 008 did for `cuems-nodeconf`'s network-map logic. Pin today's behaviour **before** moving it, so equivalence is measured rather than asserted |
| **D17 / D18b** | `Media.duration` is now `{"CTimecode": "HH:MM:SS.mmm"}` on the JSON wire, not a bare string. Fade durations already arrive wrapped and this repository already unwraps them — that is the pattern to copy |
| **D21** | A corrupt-but-current document is **repaired to a default and reported**. The report reaches this repository as a WS message from `cuems-editor`, and **rendering it is this repository's job**. A silent repair is the exact outcome the three-outcome design exists to prevent |
| **D27** | Nothing in the ecosystem releases until every consumer flow lands |

## The wire changes in exactly two ways

Stated in full in [`04-wire-contract.md`](04-wire-contract.md), and summarised here because it is the
item most likely to be got wrong:

**(a)** `schemaLocation` is **absent** from the `project_load` payload.
**(b)** `Media.duration` is `{"CTimecode": "HH:MM:SS.mmm"}` instead of a bare string.

Everything else — **every other key, the ordering, and the string boolean form** — is unchanged. The
`=== true || === 'True'` dual read still holds, and **its simplification remains optional**: a
follow-up, not a blocker for this feature. `doc_version` never reaches this repository.

The pre-2026-09-03 planning wording said something stronger and wrong (finding C3). Do not restate it.

## Why D35 is different from the other five

The other five describe what the result must be. D35 describes **the order of work**, and it is the only
decision here that a well-intentioned team will be tempted to reorder — characterization tests feel like
overhead when the port is understood.

They are not overhead; they are the **instrument**. The sibling precedent is worth knowing in detail:
`cuems-utils` feature 008 characterized `cuems-nodeconf`'s network-map behaviour *before* moving it,
purely so that equivalence could be **demonstrated** rather than argued. `cuems-nodeconf` then ran that
characterization file **unchanged** against the new API — verified **byte-identical** to the upstream
copy, inside a suite that went from 110 to 129 passing — and its own planning bundle records the rule:

> Run it against the new API; if it passes unchanged, the swap is correct. **If you find yourself
> editing it to accommodate the new API, stop** — that is the moment the guarantee is lost.

That rule applies here verbatim.

---

## What this repository must *not* do

- **Do not re-implement or re-test the node model** (007 FR-030a-i). It lives in `cuemsutils`
  exclusively, reached through `cuems-editor`'s wire. A node-model test appearing here is a regression,
  not coverage.
- **Do not let the new per-domain views inherit `settings.component.ts`'s naming mistake.** That file is
  named for the `settings` domain and edits `network_map` nodes. Name the new views for the domain they
  actually edit.
- **Do not land the domain untangling before `cuems-editor`'s half**, and do not land either half alone.
  It is one simultaneous change across two repositories and three components here.
- **Do not simplify the `=== true || === 'True'` dual read in this feature.** It is the compatibility
  mechanism for the string boolean form the wire still carries, and removing it would be a third delta
  the contract does not sanction. Optional follow-up; explicitly out of scope here.
- **Do not ship from this branch alone** (D27). See `00-runnable-flow.md` §7.
