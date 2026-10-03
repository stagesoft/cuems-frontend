<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# Contract — the characterization tests, and the rule that makes them worth writing

Phase zero's output is an **instrument**, not coverage for its own sake. This file is the contract
that instrument must satisfy. It binds the tests, not the production code.

The precedent is exact: `cuems-utils` feature 008 characterized `cuems-nodeconf`'s network-map
behaviour *before* moving it, and `cuems-nodeconf` then ran that file **unchanged** against the new
API — verified byte-identical to the upstream copy, in a suite that went from 110 to 129 passing.

---

## The rule

> Run them against the new code unchanged. **If you find yourself editing a characterization test to
> accommodate the new API, stop** — that is the moment the guarantee is lost.

### What may change, and what may not

| | Allowed | Forbidden |
|---|---|---|
| input fixture | **Yes** — swap a recorded pre-001 payload for a recorded new-wire payload where the **wire** changed (the four project deltas, the node_list split, the device shape) | Editing a fixture by hand to make an assertion pass |
| expected behaviour | **No** | Any change — a relaxed matcher, a deleted assertion, a widened type, a `toBeTruthy` where a value was asserted |
| test name / comment | Yes, for clarity | — |

If the ported code genuinely cannot reproduce the old behaviour, that is a **finding to record**,
not a test to adjust. **Exactly two** expectation changes are sanctioned — FR-004a names both, and
both are sanctioned in writing here, before the port begins. They are intended operator-visible
changes this feature exists to make, not accommodations of ported code:

- **master volume 20 → 100** (FR-032). The characterization pins `20`; the port produces `100`. The
  test is *re-pointed at the descriptor default with the change recorded in the release notes* —
  the first of the two sanctioned expectation changes.
- **the dead Adopt button** (FR-057). The characterization pins today's `canAdopt()` returning false
  for every node against a string-boolean payload. Post-014 it returns true. The assertion that
  tells those two cases apart is the point of writing it.

Nothing else may move. Any further divergence is a finding, and the sanctioned pair is closed — it
may not be extended once the port has begun (FR-004a).

---

## Fixture provenance — no invented payloads

Every fixture must trace to a recorded payload or to a documented, upstream-pinned derivation.
Provenance is recorded beside the fixture.

| Fixture | Provenance | Status |
|---|---|---|
| pre-001 `project` | `../cuems-editor/specs/001-cuems-utils-migration/evidence/project-capture/script_minimal.frame.json` (rc14, sha256 before == after) | recorded |
| pre-001 `initial_template` | `evidence/initial-template.json`, `create-script-baseline.json` | recorded |
| `initial_mappings`, 013 device shape | `evidence/initial-mappings.json` | recorded — **see the caveat** |
| post-001 `project` | run `evidence/project-capture/capture_load.py` against the editor's `tests/fixtures/script_minimal_013.xml` in the editor's environment | **capture required** |
| `schema_descriptor` (script) | `ConfigManager.get_schema_descriptor(SchemaName.SCRIPT)` in the editor's environment | **capture required** |
| `node_list` | derive from the recorded capture by the four deltas `../cuems-editor/tests/test_node_merge.py` pins (m1–m4); commit the derivation script beside the fixture | **derivation required** |

### The caveat that is easy to miss

`initial-mappings.json` was captured with the **pre-001 editor code path** on the **post-013
library**. It is therefore the *merged* frame (nodes and status inside the mapping payload) carrying
the *new* device shape, and its `online` / `adopted` are JSON `false`, **not** the `"True"` /
`"False"` strings `node_list` actually sends.

- **Valid** as the source of truth for the device and defaults shape.
- **Invalid** as a `node_list` fixture, in both its envelope and its boolean form.

Using it as one would characterize a frame the editor never sends — which is the failure mode "feed
them recorded payloads" exists to prevent, wearing the costume of compliance.

---

## Harness

Instantiate the component class inside an injection context; do not render its template:

```ts
TestBed.configureTestingModule({ providers: [ /* stubs for the nine services */ ] });
const component = TestBed.runInInjectionContext(() => new ProjectEditSequenceComponent());
```

- The two large components take their dependencies as `inject()` field initializers, so they cannot
  be `new`-ed outside an injection context — but they also need none of their template graph for the
  behaviour under characterization.
- `ngOnInit` is **not** called automatically, which is what keeps the component inert.
- Private methods are reached through their public entry point where one exists, otherwise by cast.
  The unit under characterization is today's **behaviour**, not today's API surface.
- `SettingsComponent` needs no cast: its characterization surface is already public predicates.

Runner: `npm test -- --no-watch --browsers=ChromeHeadless` (Karma builder, CLI defaults, Chrome
present at `/usr/bin/google-chrome`).

---

## Scope limits

- **No node-model test.** The node model lives in `cuemsutils` and is reached only through the
  editor's wire (007 FR-030a-i). A node-model test appearing here is a regression, not coverage.
- **No test asserting the editor's behaviour.** The producing end pins its own frames; this suite
  pins what *this* repository does with them.
- **Characterize before porting, in a separate commit.** The commit order is itself an exit
  criterion, checkable by date.
