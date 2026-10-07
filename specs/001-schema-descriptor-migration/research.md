<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# Phase 0 research — schema-descriptor migration

**Measured 2026-10-03** against this branch's tip, `../cuems-editor` `feat/xml-refactor`
(001, milestones 1 and 2) and `../cuems-editor/tests/ws-command-responses.txt`, which is the
producing end's authoritative frame list.

Every planning-bundle coordinate was re-verified. Where a number here differs from
`03-migration-inventory.md`, this file is the one measured most recently and the inventory's
coordinates predate three merges on this branch.

---

## R1 — Coordinate drift: the inventory's line numbers are all stale

**Decision**: identify every site by **file and symbol**, never by line number. Re-locate before
editing.

**Measured**: the inventory was taken on `feat/node-adoption-ui` @ `13d93b7`. This branch's tip has
moved every file it names.

| File | Inventory | Now | Drift |
|---|---|---|---|
| `project-edit/sequence/sequence.component.ts` | 1739 | **1803** | +64 |
| `services/projects/projects.service.ts` | 696 | **774** | +78 |
| `settings/settings.component.ts` | 269 | 269 | 0 |
| `project-show/sequence/sequence.component.ts` | 241 | 241 | 0 |

Spot checks: `schemaLocation` :146 → **:155**. `default_audio_output` :39 → **:47**;
`default_video_output` :41 → **:49**. `nodeconf_available` :152 → **:161**. `master_vol || 20`
:508/:703/:1003 → **:533 / :728 / :1041**. `getTemplateOutputStructure` definition :1646 →
**:1710**; its calls :1075/:1411/:1452 → **:1113 / :1475 / :1516**. The save wrapper :1141 →
**:1191**. The cue ladder :962-978 → **:994-1016**. `enabled` dual read :498 → **:523**; the string
write :997 → **:1035**. `Media.duration` read :1256 → **:1306**; `getCueMediaDuration` :1248 →
**:1298**. `localStorage` :209/:217 → **:236 / :244**, writes :293/:339 → **:320 / :339**.

**Alternative rejected**: re-measuring the bundle and quoting new numbers. They would be stale again
after the next merge, and the bundle itself warns to `git fetch` before quoting a line.

---

## R2 — **FINDING**: the device-shape migration has five consumers, not two

**Decision**: widen the requirement to all five sites. The spec's FR-062 has been amended; this is a
measurement correction, not a scope increase — the requirement always intended *every* read of a
mapping node's per-class output blocks.

`03-migration-inventory.md` §4 and `04-wire-contract.md` §5 name **three** consumers moving
together and only **two** reading `node.audio` / `node.video`. Measured, there are **five**:

| # | Site | Symbol | In the bundle? | Consequence if missed |
|---|---|---|---|---|
| 1 | `projects.service.ts:600, 616, 635` | `extractMappingOptions` | **no** | `mappingOptions` is empty, so **every cue's output selector goes blank** and new cues get no target |
| 2 | `projects.service.ts:747, 759` | `findOutputInMappings` | **no** | output lookups return null; callers fall back or warn |
| 3 | `settings.component.ts:197, 209` | `getVideoOutputs` / `getAudioOutputs` | **no** | the adoption screen lists no outputs for any node |
| 4 | `project-show/audio-mixer.component.ts:129, 133` | mixer build | yes | mixer empty |
| 5 | `project-show/video-mixer.component.ts:107, 112` | mixer build | yes | mixer empty |

Site 1 is the most consequential in the whole feature after the save wrapper, and it was unlisted.
All five degrade **silently**: each guards with `Array.isArray(...)` or `if (!node.video) return []`,
so a missing key yields an empty list rather than an error. That is the finding-C8 shape — the suite
stays green and the screen goes blank.

**Also measured**: `settings.component.ts` consumes `node_status.age_s` already
(`livenessAge()`), so the liveness badge has a freshness value available and needs no new frame.

---

## R3 — The recorded mapping payload: exact 013 shape, and one extra nesting level

**Decision**: treat `device.outputs` as `Array<Array<{output}>>`. Flatten one level; do not assume
the old group shape.

**Measured** from `../cuems-editor/.../evidence/initial-mappings.json`:

```
value.defaults[] = { "default": { "&": "<port>", "class": "audio", "direction": "output" } }
value.nodes[]    = { "node": { uuid, mac, devices[], online, adopted, ip, name } }
  devices[]      = { "device": { "class": "audio"|"video"|"dmx"|"lighting", outputs, inputs? } }
    outputs      = [ [ {"output": {id, name, mappings[], canvas_region?}}, ... ] ]   <-- list of lists
```

Three consequences the bundle does not state:

1. **`outputs` gained an array level.** Old: `node.audio[] → .outputs[] → .output`. New:
   `devices[] → .device.outputs[][] → .output`. A migration that only renames the key still reads
   nothing.
2. **`class: "lighting"` is present in the recorded payload.** The open vocabulary is live, not
   theoretical: a class filter must ignore an unknown class rather than assume three.
3. **A device may have no `inputs` key at all** (video, dmx and lighting devices here have only
   `outputs`). An empty default also simply has no `"&"` — confirmed: the `video`/`input` and
   `dmx`/`input` defaults in the capture carry `class` and `direction` and nothing else.

Also measured: `new_nodes[0].node` has **no `devices` key** — only `uuid, mac, online, adopted, ip,
name`. A discovered-but-unadopted node contributes no outputs, by construction.

---

## R4 — Fixture provenance: what is recorded, what must be captured, what must be derived

**Decision**: every fixture traces to a recorded payload or to a documented, upstream-pinned
derivation. Nothing is hand-authored. Two fixtures must be produced before the port can be
measured, and producing them is a task, not an assumption.

| Fixture | Status | How it is obtained |
|---|---|---|
| pre-001 `project` frame | **recorded** | `evidence/project-capture/script_minimal.frame.json`, with `capture-meta.json` naming `cuemsutils` 0.1.0rc14 and a before/after sha256 proving the read wrote nothing |
| pre-001 `initial_template` | **recorded** | `evidence/initial-template.json`, `create-script-baseline.json` |
| `initial_mappings`, 013 shape | **recorded** | `evidence/initial-mappings.json` — but see the caveat below |
| **post-001 `project` frame** | **must be captured** | run `evidence/project-capture/capture_load.py` against the editor's `tests/fixtures/script_minimal_013.xml` in the editor's environment. The script and the 013 fixture both exist; this yields a genuine `to_wire()` frame rather than a derivation |
| **`schema_descriptor` (script)** | **must be captured** | call `ConfigManager.get_schema_descriptor(SchemaName.SCRIPT)` in the editor's environment, exactly as the 2026-10-02 measurement did. Nothing in either repository has it recorded, and the transform (FR-033) and every descriptor requirement depend on its real shape |
| `node_list` | **must be derived** | no recorded frame exists anywhere. The editor pins it in `tests/test_node_merge.py` as *the recorded capture plus four enumerated deltas*; derive it the same way, with the derivation scripted and committed beside the fixture |

**The caveat on `initial-mappings.json`, and it matters.** That capture was taken with the *pre-001*
editor code path on the *post-013* library: `mappings-capture/README.md` records it as
`initial_setting_message()` after the import-only task and before any other `src/` edit. So it is
the **merged** frame (nodes and status inside `initial_mappings`) carrying the **new** device shape,
and its `online` / `adopted` are JSON `false`, not the `"True"` / `"False"` strings `node_list`
sends. It is therefore:

- **valid** as the source of truth for the device/defaults shape (R3) — that part is genuine;
- **invalid** as a `node_list` fixture, in both its envelope and its boolean form.

Using it as a node_list fixture would characterize a frame the editor never sends. This is exactly
the trap FR-002 is phrased to prevent, and it is not obvious from the filename.

**The four node_list deltas to apply** (from `test_node_merge.py` m1–m4): `nodeconf_available`
present beside the arrays; `adopted` / `online` as `"True"` / `"False"` strings; `node_role`
(`"controller"` / `"node"` / …) present and **no `node_type`**; the arrays and the flag live in the
`node_list` frame rather than inside `initial_mappings`.

---

## R5 — Characterization harness: class-level, inside an injection context, no template render

**Decision**: instantiate each component class with `TestBed.runInInjectionContext(() => new
TheComponent())`, providing stubs for its injected services, and call methods directly. Do **not**
use `TestBed.createComponent` for the two large components.

**Rationale**, measured: `ProjectEditSequenceComponent` takes **nine** services, all as `inject()`
field initializers (`ActivatedRoute`, `Router`, `ProjectsService`, `ProjectEditStateService`,
`MediaService`, `TranslateService`, `NotificationService`, `DrawerService`,
`ProjectWorkspaceService`). It cannot be `new`-ed outside an injection context. But rendering its
template would pull in the CDK drag-drop and menu modules, `@ngx-translate`, the router, and seven
child components — none of which the characterized behaviour touches. `runInInjectionContext`
satisfies the `inject()` calls and skips all of it. `ngOnInit` is not called automatically, which is
what makes the component inert enough to characterize.

**The behaviour under test is reachable this way.** Measured method map — the sites the context
block enumerates sit in these symbols:

| Site | Symbol | Visibility |
|---|---|---|
| cue intake: `enabled` dual read, `master_vol \|\| 20`, dmx unwrap | `transformCuesFromProject` | private, called from `loadProjectCues` |
| template reads, dmx seed, default outputs, master volume on create | `addCue(type)` | **public** |
| cue-type ladder, `enabled` write, master volume write-back, dmx write-back, **the save wrapper** | `transformCueToServerFormat(cue)` | private, called from `saveProject` (public) |
| output-structure call site 1 | inside `transformCueToServerFormat` | — |
| output-structure call sites 2 and 3 | `assignMultipleAudioOutputs` / `assignMultipleVideoOutputs`, reached from `onOutputSelectionChange` | private / **public** entry |
| read side | `getCueTypeKey`, `getCueData` | **public** |
| media duration (the `.html:134` site) | `getCueMediaDuration` | **public** |

Three of the enumerated sites are in private methods. A characterization test calls them through
their public entry point where one exists, and otherwise via a cast — acceptable and intended here,
because the unit under characterization is today's behaviour, not today's API surface.

`SettingsComponent` needs none of this care: it is already decomposed into small public predicates
(`isAlive`, `livenessAge`, `isSeenByDiscovery`, `canAdopt`, `canUnadopt`, `getNodeName`,
`getAudioOutputs`, `getVideoOutputs`, `confirmAddNode`, `confirmRemoveNode`). Those are the
characterization surface, and `canAdopt` is the one amendment 2 §2 singles out as the assertion that
tells the pre- and post-014 cases apart.

**Alternatives rejected**: (a) `TestBed.createComponent` — pulls the whole template graph in for no
coverage gain and would fail on unrelated child-component changes, making the characterization
brittle in exactly the way that invites editing it; (b) extracting the logic into pure functions
first — that is the port, and D35 forbids porting before the behaviour is pinned.

**Runner**: `ng test` uses the Karma builder with CLI defaults and no `karma.conf`. Chrome is present
at `/usr/bin/google-chrome` and `karma-chrome-launcher` is a devDependency, so the suite runs
non-interactively as `npm test -- --no-watch --browsers=ChromeHeadless`. The plan uses that
invocation so the gate is reproducible.

---

## R6 — The "partial elements on demand" design option: rejected, with the reason

**Decision**: do not pursue it in this feature. Record it as a possible follow-up with the condition
that would justify it.

**Measured**: the capability does not exist. The editor's full action list offers whole-document
reads (`project_load` returns `CuemsScript.to_wire()` of the entire script, built once by the
library's load and not walked afterwards) and whole-schema descriptor reads (`schema_descriptor`
takes a schema name and returns every type in it). There is no action that returns one element, one
cue, or one type. Adopting the option would mean **requesting a new capability from
`cuems-editor`**, which widens the coordinated tag's dependency set at the moment it is trying to
close (D27).

**And the pressure it would relieve is already relieved, twice.** The two payloads this feature must
keep fresh each have a targeted refresh today:

- `nodelist_get` re-reads just the node list without reconnecting, replying with the same
  `node_list` payload — so no extra client handling, and no project reload, to refresh adoption
  state;
- `schema_descriptor` is per-schema rather than per-config-set, so asking for `script` does not drag
  the four config documents along.

**The condition that would justify revisiting it**: if the descriptor for one schema becomes large
enough that fetching it on connect delays the project screens behind the new gate (FR-034a), a
per-type descriptor request would be the fix. That is a measurement to take after this feature, not
a design to adopt before it.

---

## R7 — Three renderings of one model, and which one the transform must target

**Decision**: write the transform (FR-033) against the **descriptor `instance`**, filling scalars
from each field's `default`. Do not use `generate_example`, and do not assume the two agree.

**Measured**, from the editor's frame list and the 2026-10-02 descriptor measurement — the same
document family is rendered three different ways:

| Rendering | Booleans | Scalars | Cue key | Where |
|---|---|---|---|---|
| `to_wire()` (the `project` frame) | `"True"` / `"False"` | real values | `Cue` + `class` | what a save must match |
| `generate_example` (was `initial_template`) | `"True"` / `"False"` | example values; `ui_properties` as strings (`0`→`"0"`, `null`→`"None"`) | `Cue` + `class` | retired |
| descriptor `instance` | — | **every scalar `null`** | no wrapper | what the transform reads |

So the instance is the right input (it is the sanctioned capability, Q2) but it is the furthest from
wire shape of the three, and the per-field `default` is the only place the values live. Hence the
transform does three things and no more: add the wrapper, invert the `channels` nesting, substitute
each `null` scalar with that field's descriptor `default`. **UR-1** is filed; the transform carries
its identifier and is deleted when it is answered.

**After `cuems-utils` 014** the boolean column collapses to JSON `true` / `false` everywhere. That
is why FR-016's native-boolean write is safe to land now (both forms are accepted today, only the
string form breaks later) and why `settings.component.ts`'s `online === true` is left alone.

---

## R8 — The gate's shape, now that two prerequisites share it

**Decision**: one shell-level gate with an ordered, named prerequisite list, resolved before any
project-domain route renders. The clarified decisions (FR-034a, FR-034b, FR-070a) make this
structural rather than optional.

**Measured ordering constraint** from the frame list: `payload_version` is the **first** frame on
every connection, before `users`, `session_id` and `initial_mappings`. The descriptor, by contrast,
is **request/reply** (`{"action": "schema_descriptor", "value": "script"}`) and the caller must ask.
So the gate's sequence is fixed by the wire:

```
connect
  -> payload_version arrives      (or never does  -> treat as version 0)
       mismatch                    -> REFUSE, render the refusal, stop
       match
         -> evict caches if the stored version differs       (FR-071a..FR-075)
         -> request schema_descriptor("script")
              absent / unusable    -> REFUSE, render the reason, stop
              present              -> project domain renders
```

Two properties this ordering forces, both of which the plan must carry into tasks:

1. **Eviction happens after the version is known and before any screen reads a cache** (FR-075).
   The two mixers read the cache directly today, so they must be moved onto the service (FR-064)
   *in the same change* — otherwise a screen can read a cache the gate has not yet cleared.
2. **A reconnect re-runs the whole sequence**, because the editor re-sends `payload_version` on
   every connection and the service auto-reconnects on error. That is the same event that
   invalidates a repair acknowledgement (FR-044a), so the reconnect path has two consumers and is
   worth one explicit owner rather than two listeners.

---

## R9 — Where the remaining upstream blocker sits

**Decision**: build the three config views read-only, and attach this repository's save-path
dependency to **UR-5** rather than opening a second report.

**Measured**, from the editor's frame list: `config_save` "refuses `script` (use `project_save`),
`hardware_outputs` (no model bindings), anything that is not a schema name, and
`default_mappings.xml`. For settings / network_map / project_mappings / project_settings it
currently answers the error frame too: cuemsutils has no public way to build those documents from
JSON yet (001 upstream report UR-5)."

UR-5 already exists in `../cuems-editor/specs/001-cuems-utils-migration/upstream-reports/` and
records the editor's own need. It does not yet record that a frontend view is blocked on it. Per
FR-082 this feature registers that dependency against UR-5 — one report with two named consumers,
rather than two reports describing one missing library call.

**Note for whoever registers it**: UR-5's "Expected" section asks for
`ConfigManager.from_json(SchemaName, payload)` or `set_document(SchemaName, payload)`. Either serves
the frontend views unchanged, so the frontend's row adds a consumer, not a requirement.

---

## R10 — Where the config documents' values come from (T103a, measured 2026-10-07)

**Decision**: outcome **(b)** — no frame carries them. The three views are built from the
descriptor (fields, types, enumerations, defaults labelled as defaults) and state that values are
not yet available; the value half and editing are recorded as not performed against **UR-2**
(filed by this feature).

**Measured** at `cuems-editor` `feat/xml-refactor` @ `22093fd` (`tests/ws-command-responses.txt` and
the action map in `CuemsWsUser.py`): the actions are `project_*`, `file_*`, `hw_discovery`,
`nodeconf`, `nodelist_modify`, `nodelist_get`, `node_status`, `repair_acknowledge`,
`schema_descriptor` and `config_save`. None returns a config document's contents.

- `schema_descriptor` serves the *schema* — fields, types, enums, defaults — not values.
- `initial_mappings` is `default_mappings.xml` (`cli.get_mappings`), the library-wide default
  mapping document — **not** a project's `mappings.xml`, and the one file `config_save` refuses.
- `node_list` carries network-map nodes merged with mapping keys, not the `network_map` document.
- `config_save` now persists all four domains (UR-5 closed upstream by cuems-utils 014; a
  project's first save still fails pending UR-6). It replaces the whole document.

**Consequence for the owner's 2026-10-06 decision to add editing to US8**: without a read, an edit
form starts from blanks or defaults and `config_save` would overwrite the controller's real
configuration with them. Decided 2026-10-07: views now, editing once UR-2 is answered.

## Consolidated decisions

| | Decision | Rationale | Alternative rejected |
|---|---|---|---|
| D-R1 | Anchor on file + symbol, not line | every inventory coordinate has drifted | re-quoting fresh numbers — stale again next merge |
| D-R2 | Device migration covers **five** sites | measured; three were unlisted, one blanks every output selector | trusting the bundle's two |
| D-R3 | `device.outputs` is a list of lists; filter unknown classes | measured, `lighting` is in the recorded payload | renaming the key only |
| D-R4 | Capture the post-001 project frame and the descriptor; derive node_list by the pinned deltas | no recorded node_list exists; `initial-mappings.json` is the merged pre-split frame with JSON booleans | reusing it as a node_list fixture — characterizes a frame never sent |
| D-R5 | Characterize at class level in an injection context | nine injected services; template render adds no coverage and much brittleness | `createComponent`; or extracting pure functions first (that is the port) |
| D-R6 | No partial-element serving | capability absent; targeted refresh already exists for both payloads that need it | requesting a new editor capability mid-tag |
| D-R7 | Transform reads the descriptor `instance`, fills from `default` | three renderings exist; only the instance is the sanctioned one | `generate_example`, which differs again |
| D-R8 | One shell gate, ordered prerequisites, one reconnect owner | wire fixes the ordering; reconnect has two consumers | per-screen guards (FR-070a forbids) |
| D-R9 | Read-only config views; dependency attached to UR-5 | the library call is missing, not the editor's handling | a second upstream report |

**No `NEEDS CLARIFICATION` items remain.** The three decisions reserved for the project owner were
answered at specification, and four more at `/speckit-clarify`; all seven are recorded in
`spec.md` § Clarifications.
