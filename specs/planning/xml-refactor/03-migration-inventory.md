<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# `cuems-frontend` — the migration inventory

**Re-verified 2026-10-02** against this branch's base, `feat/node-adoption-ui` @ `13d93b7` (2026-09-04),
which is `origin/main` @ `8d67d08` plus the four adoption/liveness commits (§4a). The 2026-09-25 pass
measured `c69dc1c`, 23 commits behind the real `origin/main`; every coordinate below supersedes it
(record: `05-amendment-2026-10-02.md`). Sites marked **NEW** were added by a re-verification pass.

File sizes for scale: `project-edit/sequence/sequence.component.ts` **1739** lines,
`projects.service.ts` **696**, `settings.component.ts` **269**, `project-show/sequence/sequence.component.ts`
**241**. Six `.spec.ts` files in the repository, none covering any of them.

---

## 1. Template consumers — four files

**`initial_template` is no longer sent** by `cuems-editor` at payload version 1. Every site below is
fed from `localStorage` (stale) or not at all, and moves onto `schema_descriptor` (§2c,
`04-wire-contract.md` §4).

| File | Sites |
|---|---|
| `src/app/services/projects/projects.service.ts` | `:182` `projectTemplate = signal<ProjectTemplate\|null>(null)`; `:209`, `:293` the `localStorage 'initial_template'` round trip; `:269` the response-type list; `:290-293` the intake; `:451`, `:476` reads |
| `src/app/services/projects/handlers/project-create.handler.ts` | `:10` `safeCloneTemplate`, `:17` `prepareTemplateForNewProject` (called `:53`, `:55`) — **discards** the cloned cue examples for whole-project creation, keeping only the `CuemsScript` scaffold. **No concrete value reads** |
| `src/app/components/projects/project-edit/project-edit.component.ts` | `:151`. No value reads |
| `src/app/components/projects/project-edit/sequence/sequence.component.ts` | `:702`, `:731`, `:875`, `:947`, `:1647` — **five** |

## 2. Three of them read concrete values — and the edit surface is larger than three sites

### 2a. `master_vol` — a default, and a drift

```
:703   newCue.master_vol = template?.['CuemsScript']?.['CueList']?.['contents']
                           ?.find((item: any) => item.AudioCue)?.AudioCue?.master_vol || 20;
```

**Measured 2026-10-02 through the descriptor** (`ConfigManager.get_schema_descriptor(SchemaName.SCRIPT)`,
type `script:AudioCueType`): `master_vol` default **100**, required, `PercentType`, no XSD `default`
attribute — a **model-layer** default. The `|| 20` fallback diverges by a factor of five. Adopting the
descriptor's answer is a **behaviour change for operators**, and the spec must say so.

The same magic number appears twice more, and all three are decided together:

```
:508    master_vol: cueData.master_vol || 20,        (reading a cue's own value on intake)
:1003   newCue.master_vol = cue.master_vol || 20;    (reading a cue's own value on write-back)
```

Note also that `:703` looks the example up by the key `AudioCue`, which no longer exists (§2d).

### 2b. `dmx_channels` — a behaviour choice, not a mechanical substitution

```
:741-743   if (dmxTemplate?.DmxCue?.DmxScene?.DmxUniverse?.dmx_channels) {
             initialChannels = dmxTemplate.DmxCue.DmxScene.DmxUniverse.dmx_channels.map(...)
:753       newCue.dmx_channels = initialChannels;
```

**Measured**: the descriptor's default is **`None`** (`script:DmxUniverseType`) — an empty starting list,
not a channel to copy. Preserving today's behaviour means keeping this component's own seed
(`[{channel: 1, value: 0}]`); adopting the descriptor's answer means new DMX cues start empty. **Decide
against the live UI.** The intake unwrapping at `:473-476` and the write-back at `:1106-1134` stay
either way: they are the wire format, not a default.

### 2c. `getTemplateOutputStructure` — not a field default, and the descriptor's instance does not fit as-is

```
:1646-1647   private getTemplateOutputStructure(cueType: 'audio' | 'video'): any | null {
               const template = this.projectsService.projectTemplate();
```

It deep-clones the example cue's first output as the structure for a new cue's outputs. Three call
sites:

```
:1075   const templateVideoOutput = this.getTemplateOutputStructure('video');
:1411   const templateAudioOutput = this.getTemplateOutputStructure('audio');
:1452   const templateVideoOutput = this.getTemplateOutputStructure('video');
```

**Upstream's Q2 capability exists — measured 2026-10-02, and it is not wire-shaped.** The descriptor
emits per-type instances `script:AudioCueOutputsType` and `script:VideoCueOutputsType` (the latter with
`output_geometry`, `corners` and `canvas_region`). But:

| | Descriptor instance | A cue output on the wire (`to_wire()`) |
|---|---|---|
| wrapper | none | `{"CueOutput": {...}}` |
| `channels` | `{"channel": [{"channel_num": null, "channel_vol": null}]}` | `[{"channel": {"channel_num": 0, "channel_vol": 100}}]` |
| scalars | all `null` | values |
| `class` | `"audio"` / `"video"` | `"audio"` / `"video"` |

Cloning the instance where the template output was cloned yields a structure the editor's save would
reject. Per this bundle's rule that is **an upstream report to `cuems-utils`** (instance in `to_wire()`
shape, or a published projection), not a hand-authored seed here. Record it before planning; it decides
`00-runnable-flow.md` §5 Q1. Leaving any call site to fall through to `undefined` is still not an option.

### 2d. **NEW** — every hardware-cue key read (cuems-utils 013, delta (c))

013 (complete, `6213b16`) changed the wire key of a hardware cue to `Cue` with a `class` field, and of a
hardware cue output to `CueOutput` with `class`. `ActionCue`, `FadeCue` and `CueList` keep their keys.
**Saving is blocked until these change**: measured, `CuemsScript.from_json` still accepts an
`AudioCue`-keyed payload, but `CuemsScript.save` refuses it
(`[T1] … Unexpected child with tag 'VideoCue'`), so the operator gets an error frame on every save.

| Site | What |
|---|---|
| `project-edit/sequence/sequence.component.ts:962-978` | the `cueTypeKey = 'AudioCue' / 'VideoCue' / 'ActionCue' / 'DmxCue' / 'FadeCue'` ladder |
| `:1141` | `const result = { [cueTypeKey]: newCue };` — the **save wrapper**: emit `Cue` plus `class` for the three hardware classes |
| `:238-239`, `:1201` | `getCueTypeKey(...)` then `originalData[cueTypeKey]` — the read side: map `Cue` + `class` to today's internal type |
| `:349`, `:353`, `:915` | `cueData.AudioCueOutput?…`, `output.AudioCueOutput?…`, `cueKey === 'AudioCue' && cue.AudioCueOutput` |
| `:703`, `:741` | the template example lookups (§2a, §2b) |
| `project-show/sequence/sequence.component.ts:117-154` | `cueItem.AudioCue` / `.VideoCue` / `.DmxCue` for id, name, type, data |
| `shared/audio-mixer/audio-mixer.component.ts:61`, `:63` | `output.AudioCueOutput.output_vol`, read and write |

`grep -rnE "AudioCue|VideoCue|DmxCue" src --include='*.ts' --include='*.html'` gives 94 lines in six
files; `design.component.html:519` is a literal label in the design gallery, not a wire read. Internal
vocabulary — unions, icons, i18n keys, routes — may keep the words. A `class` this UI has never seen must
not be an error.

## 3. Media duration — two display sites, and the pattern to copy

`Media.duration` is `{"CTimecode": "HH:MM:SS.mmm"}`. **Angular interpolating an object renders
`[object Object]`.**

| Site | Code | Kind |
|---|---|---|
| `components/projects/project-show/sequence/sequence.component.ts:197` | `return cueData?.Media?.duration \|\| '-';` | TypeScript, in `getCueDuration` (`:196` already unwraps the FadeCue case) |
| `components/projects/project-edit/sequence/sequence.component.ts:1256` | `\|\| this.getCueData(cue.originalData)?.Media?.duration` inside `getCueMediaDuration` (`:1248-1257`), rendered by `sequence.component.html:134` `{{ getCueMediaDuration(cue) }}` | TypeScript, reached from the template |

The template no longer interpolates the field itself (`22ce4c1`); the object now arrives through the
method, and only when no media file is selected (the first operand, `cue.selectedMediaFile?.file?.duration`,
is a string from `file_list`). Neither site fails loudly: the object is truthy, so `'-'` never prints.
That is an FR-030a-ii instance rendered to an operator.

**The write path** (`:1046`, `44bf807`) sends `Media.duration` back as a bare string from `file_list`.
The editor accepts a bare timecode on save and overwrites every media duration from its database
anyway, so this is not a blocker; wrap it for symmetry or leave it and say why.

**The fade path already unwraps correctly and is the pattern to copy**, both directions:

```
project-edit/sequence/sequence.component.ts:519    this.formatTimecode(cueData.duration?.CTimecode || '00:00:01.000')
project-edit/sequence/sequence.component.ts:1024   newCue.duration = { CTimecode: ... }
```

## 4. The config-domain UI — it exists and it is in daily use

| Site | What |
|---|---|
| `components/settings/settings.component.ts:37-39` | `mappings = computed(() => projectsService.initialMappings())`; `activeNodes` / `newNodes` from `.value.nodes` / `.value.new_nodes` |
| `components/settings/settings.component.ts:41-42` | `nodeconfAvailable` from `mappings()?.value?.nodeconf_available` |
| `components/settings/settings.component.ts:99` | subscribes to the `nodelist_modify` response |
| `components/settings/settings.component.ts:248-269` | `confirmRemoveNode` / `confirmAddNode`, emitting `{action:'nodelist_modify', modify_action:'ADD'\|'REMOVE', value: uuid}` |
| `components/settings/settings.component.html:236`, `:246` | the two `(confirm)` bindings that invoke them |
| `components/projects/project-show/audio-mixer/audio-mixer.component.ts:115` | `localStorage.getItem('initial_mappings')`, filters on `node?.audio` (`:129`) |
| `components/projects/project-show/video-mixer/video-mixer.component.ts:94` | `localStorage.getItem('initial_mappings')`, filters on `node?.video` (`:107`) |
| `src/app/services/projects/projects.service.ts:39`, `:41` | the `default_audio_output` / `default_video_output` interface fields; read at `project-edit/sequence/sequence.component.ts:385`, `:455`, `:697`, `:698` |

**Three of these reads stop matching the editor at payload version 1** (`04-wire-contract.md` §4–§5):

- **Nodes and `nodeconf_available` left `initial_mappings`** for the new `node_list` frame. `:37-42`
  read them from the wrong frame; `:41-42` would then read `undefined`, and `!== false` makes that
  "available" — a comfortable lie.
- **The mapping nodes changed shape (013, axis A)**: `node.audio` / `node.video` are now
  `node.devices[]` of `{"device": {"class": ..., "outputs": ..., "inputs": ...}}`, any class. Both mixer
  filters match nothing.
- **The defaults changed shape (013, axis A)**: `default_audio_output` / `default_video_output` are now
  `defaults[]` of `{"default": {"&": "<port>", "class": "audio", "direction": "output"}}`. The port text
  is under the key **`"&"`**; an empty default has no `"&"`.

**The adopt/unadopt emit is the far end of a dispatch chain** that terminates in `cuems-nodeconf`'s real
daemon on the controller. The RPC response shape `{'OK': bool, 'error'?: str}` is a contract with this
component, unchanged by the editor.

**A naming trap to not inherit**: `settings.component.ts` is named for the **`settings`** domain and
edits **`network_map`** nodes. The new per-domain views are named for the domain they actually edit.

**`localStorage` is a cache that outlives a schema change.** `initial_template` and `initial_mappings`
are both cached there (`projects.service.ts:209`, `:217-227`, `:293`, `:298-312`). Two components read
`initial_mappings` from it **directly**. After this release the cache holds an old **shape**, not only
an old split, and `initial_template` is never refreshed at all. The untangling needs an eviction story.

## 4a. The adoption / liveness tier — built on this branch's base, unmerged

On **2026-09-04** the node adopt/un-adopt hop and cluster liveness landed across four repositories, each
on its own unmerged branch. This repository's tier is **`feat/node-adoption-ui`**, the base of this
branch:

| Tier | Repository | Branch | State 2026-10-02 |
|---|---|---|---|
| **UI** | **`cuems-frontend`** | `feat/node-adoption-ui` (4 commits past `origin/main`) | **this branch's base** |
| middleware | `cuems-editor` | `feat/nodelist-adoption-api` | carried into its `feat/xml-refactor` (001), which also changed the frames this tier reads |
| engine | `cuems-engine` | `feat/nodelist-modify-dispatch` | its migration base |
| node daemon | `cuems-nodeconf` | `feat/nodelist-modify-hardening` (47 behind, largely superseded) | coordination item for that repository |

What the tier already does (`4721a65`, `e50eae1`, `5a9fabb`, `13d93b7`):

| Surface | Where |
|---|---|
| `node_status` polling (`alive`, sub-second) | `settings.component.ts:113`, `:159` |
| two presence badges, **deliberately not merged** — `online` (~30 s discovery) and `alive` | `settings.component.ts:47-51` (the reason, in a comment), `:163-176` |
| `nodeconf_available` greying the adopt controls | `settings.component.ts:41-42`; interface `projects.service.ts:152` |
| the engine's load diagnosis (`cluster_warning`, OSC `/engine/status/cluster_warning`) | `osc.service.ts:11`, `:242-269`; the project warning (`5a9fabb`) |

So `00-runnable-flow.md` §5 Q7–Q9 are **answered in code**, the right way. What is left is to carry the
tier across the wire change, and **D35's characterization tests for the settings component pin this
branch's behaviour**, not `main`'s.

**Two reads in the tier are wrong against the 001 editor:**

1. `nodeconf_available` and the node arrays come from `initial_mappings` (`:37-42`). They are on
   `node_list` now; the `nodelist_get` reply is `node_list` too.
2. **NEW — `settings.component.ts:176` reads `nodeWrapper?.node?.online === true`**, a strict JSON
   boolean. The editor sends the library's wire form, `"True"` / `"False"` (it sent JSON `true` before
   001 only because it projected nodes through the wrong schema — `../cuems-editor/specs/001-cuems-utils-migration/evidence/mappings-capture/`).
   The `online` badge would read "off" for every node. Use the same dual read the cue code uses
   (`=== true || === 'True'`). This is exactly the silent-wrong shape FR-030a-ii names.

`network_map_error` (a duplicate node identity in `network_map.xml`) is new and belongs on this screen.

## 5. The `schemaLocation` interface property

```
src/app/services/projects/projects.service.ts:146    schemaLocation: string;
```

A **non-optional** property of the interface describing the `project` frame. Delta (a) makes the key
absent. Verified 2026-10-02: it appears once — that declaration — and in no template. **Delete it.**

## 6. Test coverage, as a measured fact

```
$ find src -name '*.ts'      | wc -l     118
$ find src -name '*.spec.ts' | wc -l       6
```

The six: `app.component.spec.ts`, `core/utils.spec.ts` (added on `origin/main`),
`components/design/design.component.spec.ts`, `components/ui/icon/icon.component.spec.ts`,
`components/layout/app-header/app-header.component.spec.ts`,
`components/layout/app-footer/app-footer.component.spec.ts`.

**None of the six covers any file in §1–§4a.** Runner: `npm test` (`ng test`). Stack: Angular 19.2,
Tailwind 4.1, `osc-js`, `@ngx-translate`; package name `formitgo-tw`, version `0.0.0`. A `CLAUDE.md`
exists (`ef6571a`).

**Recorded payloads exist** for the characterization tests to feed in, so phase zero need not invent
fixtures: `../cuems-editor/specs/001-cuems-utils-migration/evidence/` holds the pre-001 `project` frame
(`project-capture/`), the pre-001 `initial_mappings` (`initial-mappings.json`) and the last
`initial_template` (`create-script-baseline.json`).

## 7. No dependency pin, and therefore no release-gate edge

This repository does not consume `cuemsutils` — it consumes `cuems-editor`'s WS payloads. It is also
**not packaged**, so it cannot carry a `debian/` relation.

The gate is the **runtime payload-version handshake**: `cuems-editor` now sends
`{"type":"payload_version","value":1}` as the first frame on every connection. A UI that does not
understand the version **refuses and says so** rather than rendering a wrapped duration as an object.
The refusal path is this repository's to design.

Keep two numbers apart:

- the **payload version** — this handshake, editor ↔ UI;
- **`doc_version`** — the on-disk document marker, which **never reaches this repository**. Verified:
  `grep -rn 'doc_version' src/` returns nothing.
