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
| **D21** | A corrupt-but-current document is **repaired to a default and reported**. The report reaches this repository as a WS message from `cuems-editor`, and **rendering it is this repository's job**. A silent repair is the exact outcome the three-outcome design exists to prevent. Since `cuems-editor` 001 (2026-10-02) the editor also **refuses to save** a repaired or converted project until the session acknowledges the report (`repair_acknowledge`), so the UI's part is rendering **and** acknowledging (`04-wire-contract.md` §7) |
| **D27** | Nothing in the ecosystem releases until every consumer flow lands |

## The wire, as of 2026-10-02

Stated in full in [`04-wire-contract.md`](04-wire-contract.md), and summarised here because it is the
item most likely to be got wrong. Until 2026-10-01 this section said "exactly two ways"; `cuems-utils`
013 (device-class reshape) completed that day and is part of this feature's wire.

**The `project` frame differs from the pre-001 frame by four deltas:**

**(a)** `schemaLocation` is **absent**.
**(b)** `Media.duration` is `{"CTimecode": "HH:MM:SS.mmm"}` instead of a bare string.
**(c)** a hardware cue is `{"Cue": {..., "class": "audio"|"video"|"dmx"|...}}` and a hardware cue output
is `{"CueOutput": {..., "class": ...}}`; `ActionCue`, `FadeCue` and `CueList` keep their keys (013).
**(d)** a video cue with no `<opacity>` in its document carries `"opacity": 100`, the `VideoCue` default.

Everything else in that frame — **every other key, the ordering, and the string boolean form** — is
unchanged. The `=== true || === 'True'` dual read still holds, and **its simplification remains
optional**: a follow-up, not a blocker for this feature. `doc_version` never reaches this repository.

**The connection changed too**, behind payload version 1: `payload_version` is the first frame;
`initial_template` is retired in favour of `schema_descriptor`; `initial_mappings` is the mapping
document alone (in 013's `devices` / `defaults` shape) and the node arrays plus `nodeconf_available` moved
to a new `node_list` frame; `document_load_report`, `document_load_failed`, `repair_acknowledge`,
`repair_save_refused` and `network_map_error` are new.

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
- **Do not land the domain untangling apart from `cuems-editor`'s half.** The editor's half is
  implemented on its `feat/xml-refactor` (001, 2026-10-02) and has not shipped; this repository's half
  ships with it under the coordinated tag, never after a deploy of it. Three components here move
  together.
- **Do not simplify the `=== true || === 'True'` dual read in this feature.** It is the compatibility
  mechanism for the string boolean form the wire still carries — now on node fields too
  (`adopted`, `online` on `node_list`) — and removing it would be a delta the contract does not
  sanction. Optional follow-up; explicitly out of scope here.
- **Do not ship from this branch alone** (D27). See `00-runnable-flow.md` §8.
