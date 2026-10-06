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
