<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# `cuems-frontend` — planning bundle for the schema-descriptor migration

**Assembled** 2026-09-25 from `cuems-utils@b7db53e` (branch `feat/xml-refactor`), whose
`specs/planning/xml-rebuild/010-consumer-prompts/05-cuems-frontend.md` is the upstream original.

**Amended** 2026-10-02 (`05-amendment-2026-10-02.md`): `cuems-utils` 013 is complete, `cuems-editor` 001
is implemented, and this branch is re-based onto `feat/node-adoption-ui`.

**Amended again** 2026-10-02 (`06-amendment-feature-014.md`): `cuems-utils` feature **014** retypes
`cms:BoolType` to `xs:boolean`, so the wire's `"True"` / `"False"` becomes JSON `true` / `false`.
That amendment is this repository's **entire** share of feature 014 — the upstream gate document
deliberately holds no frontend work — and it **supersedes `04` §4, which says to keep the string
form**. Read it before planning any boolean work.

**Purpose**: make this repository's spec-driven work **self-contained**. Everything the flow needs is
here; the sibling `cuems-utils` checkout is no longer required reading.

## Start here

Read **[`00-runnable-flow.md`](00-runnable-flow.md)** and run it. It is a complete spec-kit flow —
branch and bootstrap, a constitution step (this repository has none), the `/speckit.specify` →
`implement` chain, and exit criteria. It names the feature **`001-schema-descriptor-migration`**.

| File | What it is | Why you need it |
|---|---|---|
| [`00-runnable-flow.md`](00-runnable-flow.md) | The flow itself | The SDD. Its §1 also covers the spec-kit bootstrap, which this repository needs |
| [`01-settled-decisions.md`](01-settled-decisions.md) | The decisions that bind **this** repository | Do not reopen these |
| [`02-consumer-audit-findings.md`](02-consumer-audit-findings.md) | C3, C5, C8 — this repository's three findings | C8 is why phase zero exists at all |
| [`03-migration-inventory.md`](03-migration-inventory.md) | Every call site, **re-verified 2026-09-25**, with the sites upstream missed | Your working inventory. **§4a is a whole tier that does not exist here** and a scope decision flow 05 could not have taken |
| [`04-wire-contract.md`](04-wire-contract.md) | The payload contract, from the consuming end | The four `project` deltas, the payload-version-1 frames, and what each does to code here |
| [`05-amendment-2026-10-02.md`](05-amendment-2026-10-02.md) | What changed after 2026-09-25, and the measurements behind it | Why the coordinates, the base branch and the wire statements moved |
| [`06-amendment-feature-014.md`](06-amendment-feature-014.md) | `cuems-utils` **014** moves booleans to `xs:boolean`. **This repository's whole share of that feature**, unloaded from the upstream gate | **Supersedes `04` §4 and `03` §4a item 2.** It carries the one hard-coupled line (saving fails without it), the dead Adopt button, and the `localStorage` eviction this repository now owns |

## The one thing to understand before starting

**Phase zero is characterization tests, and it is not overhead.** This repository has **6 `.spec.ts`
files against 112 other TypeScript files** (118 total, measured 2026-10-02), and **none of the six
covers any file this feature rewrites**:

| File this feature rewrites | Lines | Has a spec? |
|---|---|---|
| `src/app/components/projects/project-edit/sequence/sequence.component.ts` | 1739 | no |
| `src/app/services/projects/projects.service.ts` | 696 | no |
| `src/app/components/settings/settings.component.ts` | 269 | no |

The six that exist cover `app.component`, `core/utils`, `components/design`, `components/ui/icon`,
`layout/app-footer` and `layout/app-header`. So **a green suite here currently evidences nothing about
this feature's blast radius** — that is finding C8, and D35 is the answer to it.

The characterization tests are the **instrument the port is measured with**, not a tax paid before the
real work. Feature 008 did exactly this before moving `cuems-nodeconf`'s network-map logic, and it is
the reason that migration had an acceptance criterion at all rather than an argument. That repository
then ran the vendored characterization file **unchanged** against the new API — and its own bundle
records the rule to copy: *if you find yourself editing the characterization test to accommodate the
new API, stop; that is the moment the guarantee is lost.*

## The largest single port, in the repository with the least coverage

That combination is the whole shape of this feature. Two consequences the spec must carry:

1. **The config-domain UI is a port, not a greenfield build** (D26). A `network_map` editing UI exists
   and is **in daily use on the controller**: `settings.component.ts`'s adopt/unadopt is the far end of
   a dispatch chain that terminates in `cuems-nodeconf`'s real daemon. The RPC response shape
   `{'OK': bool, 'error'?: str}` is a contract with this component, not an implementation detail. This
   cannot be scoped as "delete and rewrite".
2. **Three changes here cannot land alone.** The domain untangling, the repair-report rendering (now
   with an acknowledge step) and the payload-version handshake are each simultaneous with
   `cuems-editor`, whose half has landed on its branch. See `00-runnable-flow.md` §6.
3. **Saving is broken against the new editor until the cue keys move.** `cuems-utils` 013 renamed
   hardware cues to `Cue` with `class`; the editor's library refuses to save the old keys.
   `03-migration-inventory.md` §2d.

## Freshness — re-measured 2026-10-02 on `feat/node-adoption-ui` @ `13d93b7`

The 2026-09-25 pass recorded `main` @ `c69dc1c` as "in sync with `origin/main`". That was an unfetched
tracking ref: after `git fetch` the real `origin/main` is `8d67d08` (2026-08-11), **23 commits** ahead,
and `origin/feat/node-adoption-ui` (2026-09-04) is four commits beyond that. This branch now sits on the
latter, and every coordinate in `00`–`04` is re-measured there (old → new table:
`05-amendment-2026-10-02.md` §2).

## Corrections applied on vendoring

1. **The media-duration display has a second site upstream does not list.** On today's base the
   template (`sequence.component.html:134`) renders it through `getCueMediaDuration`, and the object
   comes from `sequence.component.ts:1256`. See `03-migration-inventory.md` §3.
2. **`getTemplateOutputStructure` has three call sites, not one.** Its definition is `:1646`; it is
   called from `:1075`, `:1411` and `:1452`. The edit surface is three times what the finding's phrasing
   suggests.
3. **The `|| 20` fallback appears three times, not once.** `:703`, `:508` and `:1003`. And the value it diverges from is measured:
   `cuems-utils/src/cuemsutils/cues/AudioCue.py:9` declares `'master_vol': 100` — a **model-layer**
   default, not an XSD `default` attribute, which is precisely why D25 makes model-layer defaults
   non-optional in the descriptor.
4. **The `schemaLocation` interface property is confirmed unread.** Upstream says "a REQUIRED interface
   property nothing reads". Verified 2026-10-02: it appears once, as the declaration at
   `projects.service.ts:146`, and in no template. Deleting it is safe — and necessary, because an
   interface that describes an absent key is how the next reader concludes the key is still there.
5. **The spec-kit bootstrap has a version problem upstream could not know.** The three landed sibling
   repositories were initialized with spec-kit **1.0.4**; the `specify` CLI on this development machine
   is **0.16.2**. `00-runnable-flow.md` §1 states the options rather than picking one silently.
6. **The adoption / liveness tier exists — on `feat/node-adoption-ui`, now this branch's base.** The
   2026-09-25 pass found it missing because it measured `main` only. On 2026-09-04 the tier landed here
   too, unmerged: `node_status` polling, separate `online` and `alive` badges, `nodeconf_available`, and
   the project-load warning. `03-migration-inventory.md` **§4a** carries what it does and the two reads
   it must change for the 001 editor (`node_list`; `online` as `"True"` / `"False"`).
