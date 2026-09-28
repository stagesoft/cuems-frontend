<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# `cuems-frontend` — planning bundle for the schema-descriptor migration

**Assembled** 2026-09-25 from `cuems-utils@b7db53e` (branch `feat/xml-refactor`), whose
`specs/planning/xml-rebuild/010-consumer-prompts/05-cuems-frontend.md` is the upstream original.

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
| [`04-wire-contract.md`](04-wire-contract.md) | The payload contract, from the consuming end | The two deltas, and what each one does to code here |

## The one thing to understand before starting

**Phase zero is characterization tests, and it is not overhead.** This repository has **5 `.spec.ts`
files against 112 other TypeScript files** (117 total, measured 2026-09-25), and **none of the five
covers any file this feature rewrites**:

| File this feature rewrites | Lines | Has a spec? |
|---|---|---|
| `src/app/components/projects/project-edit/sequence/sequence.component.ts` | 1662 | no |
| `src/app/services/projects/projects.service.ts` | 640 | no |
| `src/app/components/settings/settings.component.ts` | 140 | no |

The five that exist cover `app.component`, `components/design`, `components/ui/icon`,
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
2. **Three changes here cannot land alone.** The domain untangling, the repair-report rendering and the
   payload-version handshake are each simultaneous with `cuems-editor`. See `00-runnable-flow.md` §6.

## Freshness — unchanged since 2026-05-14, and every coordinate holds

The upstream flow measured this repository on **2026-09-03** at `main`/`c69dc1c`. Re-measured
2026-09-25: **`main` @ `c69dc1c` (2026-05-14), in sync with `origin/main`, clean.** Every line number
upstream recorded still resolves to the same line.

One count to read carefully: upstream's *"5 spec files against 112 `.ts` files"* is **correct** —
`find src -name '*.ts' | wc -l` gives **117**, of which 5 are the specs, so 112 is the non-spec count.
It is not drift.

## Corrections applied on vendoring

1. **The media-duration display has a second site upstream does not list** — an Angular **template**
   interpolation, which fails the same way and is easier to miss because it is not TypeScript. See
   `03-migration-inventory.md` §3.
2. **`getTemplateOutputStructure` has three call sites, not one.** Upstream names its definition
   (`:1570-1600`). It is called from `:1022`, `:1346` and `:1387`. The edit surface is three times what
   the finding's phrasing suggests.
3. **The `|| 20` fallback appears three times, not once.** Upstream names `:688`. The same magic number
   is also at `:502` and `:965`. And the value it diverges from is measured:
   `cuems-utils/src/cuemsutils/cues/AudioCue.py:9` declares `'master_vol': 100` — a **model-layer**
   default, not an XSD `default` attribute, which is precisely why D25 makes model-layer defaults
   non-optional in the descriptor.
4. **The `schemaLocation` interface property is confirmed unread.** Upstream says "a REQUIRED interface
   property nothing reads". Verified 2026-09-25: it appears once, as the declaration at
   `projects.service.ts:120`, and in no template. Deleting it is safe — and necessary, because an
   interface that describes an absent key is how the next reader concludes the key is still there.
5. **The spec-kit bootstrap has a version problem upstream could not know.** The three landed sibling
   repositories were initialized with spec-kit **1.0.4**; the `specify` CLI on this development machine
   is **0.16.2**. `00-runnable-flow.md` §1 states the options rather than picking one silently.
6. **A whole tier of an existing feature is missing here, and flow 05 predates it.** On 2026-09-04 a
   node adoption / cluster-liveness feature landed across `cuems-editor`, `cuems-engine` and
   `cuems-nodeconf` — unmerged in all three — and **this repository's UI tier was never written**. The
   editor is ready to serve `nodelist_get`, `node_status`, `cluster_warning` and `nodeconf_available`;
   `grep` finds none of them in `src/`. `03-migration-inventory.md` **§4a** carries the map, the
   three-way entanglement it creates, and the `online`-vs-`alive` trap. Whether to build the tier is a
   **scope decision for the spec**, not an omission to quietly fill.
