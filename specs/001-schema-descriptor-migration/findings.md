<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# Findings — measured during implementation

Where the code or the upstream wire did not match what `spec.md` / `tasks.md` assumed. Each is a
measurement, recorded rather than accommodated (`contracts/characterization-rules.md`). None of
them is an edited expectation: the characterization pins what the code does, and these are the
places that differs from what the planning text predicted.

## Characterization (Phase 2, measured 2026-10-06 against unmodified production code)

**F1 — the DMX template branch does fire (T015).** The task says the one-channel seed
`[{channel: 1, value: 0}]` is "the component's own fallback, which is what operators see today
because the template branch never fires". Against the recorded pre-001 template it *does* fire:
the template's `DmxCue` carries `dmx_channels: [{DmxChannel: {channel: 0, value: 0}}]`, which maps
to the same `[{channel: 1, value: 0}]`. The operator-visible value is identical either way;
`addCue('dmx')` is pinned for both the template and the no-template case.

**F2 — today's new-audio-cue volume is the template's 66, not 20 (T015, FR-032).** `addCue('audio')`
reads `master_vol` from the cached template's `AudioCue` first; the recorded template carries 66
(`create_script()`'s example value). `|| 20` is reached only with no cached template. The
characterization pins both. The sanctioned change "20 → 100" therefore reads, for the creation
path, as "template value, else 20" → "descriptor default 100". The intake and write-back paths
(`cueData.master_vol || 20`, `cue.master_vol || 20`) are 20 → 100 exactly as written.

**F3 — `[object Object]` is not reachable in the edit sequence today (T019, T050).** The task
says that with no media file selected `getCueMediaDuration` returns the duration wrapper object.
Measured:

- fed today's wire, `Media.duration` is a bare string, so it returns `'00:00:00.000'`;
- fed the tip wire, today's cue ladder knows no `Cue` key, so every hardware cue is dropped by
  `transformCuesFromProject` before its duration is ever read.

The wrapper would only reach the template if the ladder were ported without the unwrap. The
pinned expectation is therefore `'00:00:00.000'` for the recorded no-file case, and the port must
keep it on the tip wire — the same expectation with the input swapped, rather than the flip T050
anticipates. The `[object Object]` defect is real in `project-show/sequence` (`getCueDuration`,
T047), which reads the duration without a ladder in front of it.

**F4 — on today's wire `canAdopt` works and `canUnadopt` is right (T020, T021).** The tasks
describe `canAdopt` as false for every node and `canUnadopt` as permanently true. Both are true
only of the post-001 *string-boolean* `node_list`. Today's deployed editor sends JSON booleans and
still sends `node_type`, so `isSeenByDiscovery` / `canAdopt` are true for an online node and
`canUnadopt` refuses the controller (`NodeType.master`). The characterization pins today's wire and,
as input variations, the string-boolean case (`canAdopt` false) and the missing-`node_type` case
(`canUnadopt` true for the controller) — the two defects the port must not reintroduce.

**F5 — the editor tip already sends JSON booleans (FR-057, T079).** Editor `8f8b46e` adopted
cuems-utils 014: `adopted` / `online` / `enabled` / `autoload` / `timecode` are JSON booleans on
the tip wire. So the sanctioned `canAdopt` flip (string → boolean) has already happened upstream,
and `online === true` is correct against the wire this branch ships with — T079's "leave it alone"
case. See F6 for why the frontend still cannot rely on it.

**F6 — the boolean form changed without a payload-version bump (upstream).** The tip still
announces `payload_version` 1 while carrying post-014 booleans. `tests/ws-command-responses.txt`
says a value-form change of the string booleans *is* a bump. A version-1 client cannot tell the
two version-1 wires apart, so every boolean read here stays correct on both forms. To raise with
`cuems-editor`.

**F7 — the pre-001 `schemaLocation` key is namespaced.** The recorded pre-001 project frame's
top-level key is `{http://www.w3.org/2001/XMLSchema-instance}schemaLocation`, not
`schemaLocation` as the payload interface declares. `saveProject` sends every top-level key of the
loaded project back unchanged (pinned), so today's save echoes that key.

**F8 — `findOutputInMappings` searches audio before video.** A video output whose name equals an
audio output's id (`"0"`) resolves to the audio output. The video save paths only check the result
for non-null, so it is harmless there; pinned as-is.

**F9 — the CLI scaffold specs never ran green (T008).** Six of 26 existing tests failed on a clean
checkout (missing providers, and one assertion about an `<h1>` the app never had). Fixed in a
separate commit before the characterization.

## Port (Phase 3 onward)

**F10 — the characterization pinned the storage mechanism the port is required to change.** Seven
T009–T013 tests asserted *where* and *when* payloads were cached: the bare keys
`initial_template` / `initial_mappings`, read back in the constructor, and `project_status` sent on
the socket's `isConnected` edge. FR-071a moves the key into the namespace, FR-075 moves the
read-back after the version is known, T031 deletes the template cache, and T032b hangs the status
query on the gate's session start. None of these is one of FR-004a's two sanctioned changes, and
none is an accommodation of ported code: each is a requirement. The two template-cache tests were
deleted with the cache; the other five keep their asserted values (the round-tripped frame, the
re-extracted options, the wrap of a bare value, null for an unparseable entry, one status query per
connection) and changed only their input — where the cache entry sits, and a connection
announcing its version.

**F11 — eviction runs on a refused connection too.** Research R8 places eviction after a version
*match*. It runs as soon as the version is known, match or not: otherwise a payload a refused
(older or newer) editor sends is cached under the previous connection's version tag and survives
into the next matching session. Evicting first tags it with the refused version, so the next
matching connection evicts it.

**F12 — the descriptor cannot build a saveable output on its own (UR-1, FR-033).** Measured
against cuems-utils `69acaef` by building payloads from `schema-descriptor-script.json` and
running them through the editor's save path (`CuemsScript.from_json(...).save()`) in a scratch
environment. `AudioCueOutputsType.output_vol`, `AudioChannelType.channel_num` / `channel_vol`,
`VideoOutputGeometryType.x_scale` / `y_scale` and `Coordinates.x` / `y` are **required with a
null default**; the library refuses a save carrying null in any of them. FR-033's constraint
("every value originates in the descriptor; nothing is hand-authored") therefore made every audio
and video output unsaveable. **Decided by the project owner, 2026-10-06:** one constant,
`UR1_UI_STARTING_VALUES` in `schema-descriptor.handler.ts`, tagged UR-1, used only where a
required field's descriptor default is null, holding the values the retired template gave
operators (output volume 80, one channel 0 at 80, scale 1, corners 0) — the standing T055 gives
the DMX seed. The same measurement found:

- an alias video output must carry **no** `canvas_region` (the library refuses one); the
  descriptor instance carries it with null scalars. The transform omits an optional field that is
  still empty, which is a descriptor rule (`required: false`), not a special case;
- the descriptor's cue-level instance lists one generic `CueOutput` with `class: null` under
  `outputs`, which the library refuses; a new hardware cue starts with `outputs: []`;
- `enabled: "True"` is **refused** by the 014 library ("xs:boolean accepts 'true', 'false', '1',
  '0' or a bool"), so T046 is a requirement, not a nicety;
- a top-level `schemaLocation` beside `CuemsScript` is refused (`IngestError`), confirming T037;
- `action_target` is required on ActionCue and FadeCue: a cue left without a target is refused at
  save with the library's message naming the cue (the T049a path);
- a bare-string `Media.duration` is still accepted on save, so the media write was left as it is.

**F13 — Phases 4 and 5 land together for the edit sequence.** The tip wire sends no
`initial_template`, and `transformCueToServerFormat` builds every saved cue by cloning a template
cue. With only Phase 4's cue-key port, every cue would be dropped at save against the tip. So the
key port (T037–T041, T045, T046, T048, T049) and the template's replacement by the descriptor
(T051–T057) are one change for `project-edit/sequence`.

**F14 — FR-004a's closed pair is narrower than the changes the tasks themselves mandate.** Besides
master volume and `canAdopt`, these tasks *require* expectations to move: the save wrapper and
output keys (T038/T039, delta (c)), `enabled` as a native boolean (T046), the retired template's
example values in the structures built from it (T056/T060), and — measured in F10 — the cache
location. Each moved expectation is listed in the commit that moves it and traces to its task;
none is an accommodation of ported code. Everything not traceable to a task stays pinned.

**F15 — every save from today's UI is refused by the tip library, independent of cue keys.**
Both save paths (`project-edit` and its `sequence` child) send the loaded frame back with keys
*beside* `CuemsScript`: a top-level `uuid` (both), and `name` / `description` / `unix_name` /
`created` / `modified` (decorations the components add for display, on the shared object). The
library's `CuemsScript.from_json` refuses any top-level key but `CuemsScript` (`IngestError …
got ['CuemsScript', 'uuid']`, recorded in `fixtures/project-save-refusals.json`), and the editor
passes the payload through unstripped. Both paths now send `{"CuemsScript": …}` alone; the
characterization's "top-level keys included" assertion moved accordingly (T037's rule, widened
from `schemaLocation` to every sibling key).

**F16 — every save rebuilds each cue from the template / descriptor (pre-existing, unchanged).**
`transformCueToServerFormat` starts each saved cue from a fresh instance and copies in only the
fields the UI models. So fields the UI does not edit — `opacity`, `ui_properties`, `autoload`,
`timecode`, `target`, `fadeout_time` — are reset to the template's (now the descriptor's) values on
every save. Characterized, and kept: changing it is out of this feature's scope. It is also why
T049 holds by construction: nothing reads `opacity`, so its new presence (delta (d)) cannot be
mistaken for an operator's choice. Worth its own feature.

**F17 — T049a: the refusal text already reaches the operator, cue named.** The editor's save
refusals have no `Reason: …\n` line, so `parseErrorMessage` passes them through whole and the cue
id survives; `ProjectsService` relays `project_save` errors to a toast. Nothing reads
`hasRecentError`, so its 3 s window swallows nothing. The one change: the leading Python
`<class '…'>` is stripped, keeping the library's sentence.

**F18 — offline round trip against the library (part of T120).** The ported component's own save
payload — the recorded tip project edited, plus one new cue of each kind built from the
descriptor, with a custom video output and action/fade targets — was captured from the test
harness and run through the editor's save path and back (`fixtures/capture/validate_save.py`, the
scratch environment of `fixtures/README.md`): saved, reloaded, outcome `clean`, all ten cues back
as `Cue`/`audio|video|dmx`, `ActionCue`, `FadeCue`, with native booleans, `master_vol` 100 on the
new audio cue and the canvas region on the custom output only. The live checks against a running
editor remain T120's.

**F19 — the `schemaLocation` T036 deletes was on the mapping interface.** The only declaration in
`projects.service.ts` is `InitialMappingsResponse.value.schemaLocation` — the *mapping* payload,
which the pre-001 editor did carry. The project frame was never typed (it travels as `any`), and
its key was namespaced anyway (F7). Deleted all the same: the tip mapping document has no
`schemaLocation` either. The save paths' real exposure was the keys sent beside `CuemsScript` (F15).

## Upstream reports

Items for other repositories, raised from what this feature measured. Each names its consumer here.

**To `cuems-utils` — UR-1 addendum: required fields with no default.** Beyond UR-1's three shape
differences (wrapper, `channels` nesting, null scalars), filling scalars from per-field `default`
is not enough: the required fields listed in F12 have a null default, so no descriptor-only
output is valid. Expected: a default for each required scalar of the output types, or the
wire-shaped instance UR-1 asks for with values filled. Consumer: `UR1_UI_STARTING_VALUES`,
deleted when answered. *Not yet filed upstream.*

**To `cuems-editor` — the boolean form changed without a payload-version bump (F6).** The tip
carries post-014 JSON booleans at `payload_version` 1, against the editor's own bump rule. A
version-1 client cannot tell the two version-1 wires apart. Expected: version 2 for the 014 wire,
or the rule restated. Consumer: every boolean read in this repository, which stays dual for now.
*Not yet filed upstream.*

**To `cuems-editor` — `capture_load.py` no longer runs.** `evidence/project-capture/capture_load.py`
calls `CuemsDBProject.load_xml`, which now returns `(CuemsScript, LoadReport)`; the script's
`json.dumps` fails. Low impact (evidence tooling). *Not yet filed upstream.*
