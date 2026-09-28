<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# `cuems-frontend` — the migration inventory

**Re-verified 2026-09-25** against `main` @ `c69dc1c`, in sync with `origin/main`, clean. Every line
number the upstream flow recorded on 2026-09-03 still resolves to the same line. Sites marked **NEW**
are ones this pass added.

File sizes for scale: `project-edit/sequence/sequence.component.ts` **1662** lines,
`projects.service.ts` **640**, `settings.component.ts` **140**, `project-show/sequence/sequence.component.ts`
**238**. Five `.spec.ts` files in the repository, none covering any of them.

---

## 1. Template consumers — four files

The count was low in earlier passes; it is four, not two.

| File | Sites |
|---|---|
| `src/app/services/projects/projects.service.ts` | `:150` `projectTemplate = signal<ProjectTemplate\|null>(null)`; `:159`, `:162`, `:242-243` the `localStorage 'initial_template'` round trip; `:219` the response-type list; `:240-243` the intake; `:395`, `:420` reads |
| `src/app/services/projects/handlers/project-create.handler.ts` | `:10` `safeCloneTemplate`, `:14` the deep clone, `:17-23` `prepareTemplateForNewProject` — **discards** the cloned cue examples for whole-project creation, keeping only the `CuemsScript` scaffold. **No concrete value reads** |
| `src/app/components/projects/project-edit/project-edit.component.ts` | `:141`. No value reads |
| `src/app/components/projects/project-edit/sequence/sequence.component.ts` | `:687`, `:716`, `:850`, `:909`, `:1571` — **five** |

## 2. Three of them read concrete values — and the edit surface is larger than three sites

This is the distinction that matters: **three *kinds* of value read**, but more than three lines.

### 2a. `master_vol` — a default, and a drift

```
:688   newCue.master_vol = template?.['CuemsScript']?.['CueList']?.['contents']
                           ?.find((item: any) => item.AudioCue)?.AudioCue?.master_vol || 20;
```

**Measured**: the schema declares `master_vol` as a required `cms:PercentType` with no XSD `default`,
and the **model-layer** default is `100` — `cuems-utils/src/cuemsutils/cues/AudioCue.py:9`,
`'master_vol': 100,  # Default to full volume`. So the `|| 20` fallback already diverges from the
library's own answer by a factor of five, silently, today. The descriptor substitution replaces the
template walk **and fixes that drift** — which is a *behaviour change for operators*, not a
refactor, and the spec must say so rather than let it arrive as a side effect.

This is also exactly why D25 makes **model-layer defaults non-optional** in the descriptor: an XSD-only
descriptor could not have answered this question at all.

**NEW — the same magic number appears twice more**, and both must be decided with `:688`:

```
:502   master_vol: cueData.master_vol || 20,        (reading a cue's own value on intake)
:965   newCue.master_vol = cue.master_vol || 20;    (reading a cue's own value on write-back)
```

Neither is a *template* read, so neither is a descriptor substitution — but both encode the same wrong
fallback, and fixing only `:688` leaves two sites that still answer 20 where the library answers 100.
Decide all three together.

### 2b. `dmx_channels` — a behaviour choice, not a mechanical substitution

```
:726-727   if (dmxTemplate?.DmxCue?.DmxScene?.DmxUniverse?.dmx_channels) {
             initialChannels = dmxTemplate.DmxCue.DmxScene.DmxUniverse.dmx_channels.map(...)
```

It walks `contents`, finds a `DmxCue`, and unwraps each `{DmxChannel: {...}}` to seed the new cue's
channel list. **The descriptor's default here is `None`** — an empty starting list, not a channel to
copy. So preserving today's behaviour means keeping this component's own seed
(`[{channel: 1, value: 0}]`); adopting the descriptor's answer means new DMX cues start empty.

**Both are defensible. Decide against the live UI**, not on paper — and note the mirrored unwrapping
at `:467-469` (intake) and `:1071`/`:1081` (write-back), which stay either way because they are the
wire format, not a default.

### 2c. `getTemplateOutputStructure` — not a field default at all

```
:1570-1571   private getTemplateOutputStructure(cueType: 'audio' | 'video'): any | null {
               const template = this.projectsService.projectTemplate();
```

It deep-clones the example `AudioCue`'s first `AudioCueOutput` (or `VideoCue`'s `VideoCueOutput`) as
the structure for a new cue's outputs. **Listed by no earlier pass.** This one needs a constructible
instance of a **whole nested complex type** — `output_geometry`, `canvas_region`, the mapping shape —
not a scalar default.

**NEW — three call sites, not one.** Upstream names the definition only:

```
:1022   const templateVideoOutput = this.getTemplateOutputStructure('video');
:1346   const templateAudioOutput = this.getTemplateOutputStructure('audio');
:1387   const templateVideoOutput = this.getTemplateOutputStructure('video');
```

**This is the site upstream's clarification Q2 was answered for.** The descriptor emits, per complex
type, a **constructible empty instance** alongside its five existing facts — recorded upstream as a
deliberate exception, the only descriptor change feature 010 sanctioned, because the alternatives were
a hand-authored seed here (which drifts from the schema — the exact failure the cutover ends) and
cloning from a generated example (which works only while the example happens to contain one of every
cue type). So the capability **exists**; confirm it covers these three call sites before assuming it
does, and if it does not, that is an upstream report rather than a local hand-authored seed.

Leaving any of the three to fall through to `undefined` is not an option.

## 3. Media duration — two display sites, and the pattern to copy

`Media.duration` is `{"CTimecode": "HH:MM:SS.mmm"}` post-008. **Angular interpolating an object
renders `[object Object]`.**

| Site | Code | Kind |
|---|---|---|
| `components/projects/project-show/sequence/sequence.component.ts:194` | `return cueData?.Media?.duration \|\| '-';` | TypeScript, in `getCueDuration` |
| **NEW** `components/projects/project-edit/sequence/sequence.component.html:134` | `{{ getCueData(cue.originalData)?.Media?.duration \|\| '-' }}` | **Angular template interpolation** |

The second is new to this pass and is the easier of the two to miss, because a grep over `*.ts` does
not find it. Both fail the same way, and neither fails loudly: `'-'` is not printed (the object is
truthy), so the cell shows `[object Object]` where a timecode used to be. **That is an FR-030a-ii
instance rendered to an operator** — the code keeps resolving and the answer is wrong.

**The fade path already unwraps correctly and is the pattern to copy**, both directions:

```
project-edit/sequence/sequence.component.ts:506   this.formatTimecode(cueData.duration?.CTimecode || '00:00:01.000')
project-edit/sequence/sequence.component.ts:980   newCue.duration = { CTimecode: this.ensureMilliseconds(...) }
```

Also already wrapped and already handled, so they need no change but show the shape is familiar here:
`project-show/sequence/sequence.component.ts:156` (`prewait?.CTimecode`), `:166` (`postwait`),
`project-edit/sequence/sequence.component.ts:484-486` (`offset`, `prewait`, `postwait`),
`project-edit/project-edit.component.ts:157-160`.

## 4. The config-domain UI — it exists and it is in daily use

| Site | What |
|---|---|
| `components/settings/settings.component.ts:35` | subscribes to the `nodelist_modify` response, `filter(response => response?.type === 'nodelist_modify')` |
| `components/settings/settings.component.ts:48`, `:56` | reads `projectsService.initialMappings()` — `.value.nodes` and `.value.new_nodes` |
| `components/settings/settings.component.ts:119-137` | `confirmRemoveNode` / `confirmAddNode`, emitting `{action:'nodelist_modify', modify_action:'ADD'\|'REMOVE', value: uuid}` |
| `components/settings/settings.component.html:162`, `:172` | the two `(confirm)` bindings that invoke them |
| `components/projects/project-show/audio-mixer/audio-mixer.component.ts:80` | `localStorage.getItem('initial_mappings')` |
| `components/projects/project-show/video-mixer/video-mixer.component.ts:94` | `localStorage.getItem('initial_mappings')` |

**The adopt/unadopt emit is the far end of `cuems-nodeconf`'s dispatch chain**, which terminates in a
real daemon on the controller that operators use today. The RPC response shape
`{'OK': bool, 'error'?: str}` is a contract with this component. It is also newly served by
`cuems-engine`'s adopt/un-adopt hop (landed on `feat/nodelist-modify-dispatch`, 2026-09), so all three
ends of this chain are moving in this release — coordinate, do not assume.

**A naming trap to not inherit**: `settings.component.ts` is named for the **`settings`** domain and
edits **`network_map`** nodes. The new per-domain views are named for the domain they actually edit.

**`localStorage` is a cache that outlives a schema change.** `initial_template` and `initial_mappings`
are both cached there (`projects.service.ts:159`, `:167`, `:173-177`, `:243`, `:253-262`). Two
components read `initial_mappings` from it **directly**, bypassing the service. A cache that survives
an upgrade is how a UI shows the wrong shape afterwards — the untangling needs an eviction story, not
just a new payload.

## 4a. The tier that does not exist — an adoption/liveness surface with no UI

Found 2026-09-25, and absent from every upstream document including flow 05.

On **2026-09-04**, fourteen commits landed across **three** repositories as one coordinated feature —
the node adopt/un-adopt hop and cluster liveness — under three different branch names. **None is merged
anywhere**, and **this repository's tier was never written**:

| Tier | Repository | Branch | State |
|---|---|---|---|
| **UI** | **`cuems-frontend`** | — | **nothing exists** |
| middleware | `cuems-editor` | `feat/nodelist-adoption-api` (5 commits) | its migration base, by decision |
| engine | `cuems-engine` | `feat/nodelist-modify-dispatch` (6 commits) | its migration base, by decision |
| node daemon | `cuems-nodeconf` | `feat/nodelist-modify-hardening` (3 commits, **47 behind**, unmerged) | divergent — see the editor bundle's §0a |

Measured here:

```bash
$ grep -rn "nodelist_get\|node_status\|cluster_status\|cluster_warning\|nodeconf_available" src/
# no matches
```

So the editor is ready to serve four things this UI does not ask for and cannot display:

| Message | What it carries | Served by |
|---|---|---|
| `nodelist_get` | the node list on demand, rather than only inside `initial_mappings` | `CuemsWsUser.py:437` |
| `node_status` | `{"alive": [...], "adopted": [...], "controller": uuid, "age_s": n}` — the engine's **sub-second** ping/pong, relayed from its `cluster_status` | `CuemsWsUser.py:463-504` |
| `cluster_warning` | what the last project load found wrong with the cluster, broadcast | `cuems-engine`'s `_broadcast_cluster_warning` |
| `nodeconf_available` | whether the node daemon is answering — **injected into `mappings_dict`**, so it already arrives inside `initial_mappings` today | `CuemsWsServer.py:491`, `:537` |

**Three consequences for this feature, and the third is a trap:**

1. **`initial_mappings` is a three-way entanglement, not two-way.** §4 and `04-wire-contract.md` §5
   describe `project_mappings` + `network_map` node status. On the editor's base branch it also carries
   `nodeconf_available`, which belongs to **no schema at all** — it is a liveness observation about a
   daemon, computed at serve time. A descriptor-driven form for `project_mappings` must not acquire it
   as a field. Decide where it renders before porting.
2. **`node_status.alive` is not each node's `online`, and conflating them is a real bug with a real
   consequence.** `online` is `cuems-nodeconf`'s discovery view, refreshed within **~30 s**; `alive` is
   the engine's sub-second ping/pong, and the editor's own docstring
   (`../cuems-editor/src/cuemseditor/CuemsWsUser.py:469-472`) calls it *"the only signal the GO gate
   trusts"*. `settings.component.ts` shows `online` today. A ported form that renders one "is this node
   up?" control has silently chosen — probably the staler of the two, on the screen operators use to
   adopt hardware.
3. **Whether building the UI tier is in scope is a decision, not an omission to fill in.** It is
   genuinely new UI work, not a port, and D26's "this is a migration, not a greenfield build" does not
   cover it. Flow 05 was written before the cluster existed. If it is out of scope, say so explicitly —
   otherwise the ecosystem ships a liveness and adoption surface three tiers deep that no operator can
   see.

## 5. The `schemaLocation` interface property

```
src/app/services/projects/projects.service.ts:120    schemaLocation: string;
```

A **non-optional** property of the interface describing the `project_load` payload. Delta (a) makes the
key absent. **Verified 2026-09-25**: it appears exactly once — that declaration — and in no template.
Nothing reads it, so nothing breaks; but the interface now describes a key that is not there.

**Delete it.** An interface that lies is how the next reader concludes the field is still present.

## 6. Test coverage, as a measured fact

```
$ find src -name '*.ts'      | wc -l     117
$ find src -name '*.spec.ts' | wc -l       5
```

The five: `app.component.spec.ts`, `components/design/design.component.spec.ts`,
`components/ui/icon/icon.component.spec.ts`, `components/layout/app-header/app-header.component.spec.ts`,
`components/layout/app-footer/app-footer.component.spec.ts`.

**None of the five covers any file in §1–§4.** Runner: `npm test` (`ng test`). Stack: Angular 19.2,
Tailwind 4.1, `osc-js`, `@ngx-translate`; package name `formitgo-tw`, version `0.0.0`.

## 7. No dependency pin, and therefore no release-gate edge

This repository does not consume `cuemsutils` — it consumes `cuems-editor`'s WS payloads. It is also
**not packaged**, so it cannot carry a `debian/` relation, and upstream FR-091's mechanism does not
reach it.

Upstream's answer (FR-108) is a **runtime payload-version handshake**: the editor advertises a payload
version when a client connects, and a UI that does not understand it **refuses and says so** rather
than rendering a wrapped duration as an object. §3 above is exactly what "rendering a wrapped duration
as an object" looks like, which is why the handshake is this repository's only gate.

Keep two numbers apart, because merging them is a recorded hazard:

- the **payload version** — this handshake, editor ↔ UI;
- **`doc_version`** — the on-disk document marker, which **never reaches this repository**. Verified:
  `grep -rn 'doc_version' src/` returns nothing.
