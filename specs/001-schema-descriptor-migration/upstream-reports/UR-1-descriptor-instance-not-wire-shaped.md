<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# UR-1 — The schema descriptor's per-type `instance` is not in `to_wire()` shape

**To** `cuems-utils`. **From** `cuems-frontend` 001 (schema-descriptor migration), 2026-10-03.
**Measured** against `cuemsutils` `0.1.0rc16` @ `6213b16` (feature 013 complete), as served by
`cuems-editor` `feat/xml-refactor` @ `8247e9b` via the `schema_descriptor` frame.

**Filed before planning**, per this feature's FR-036. It is the removal trigger for the local
transform FR-033 introduces; that transform exists only until this report is answered.

## Background — why this repository depends on the instance at all

`initial_template` is retired at payload version 1. Until then this repository built a new cue's
output structure by deep-cloning the first output of the example cue in that template
(`getTemplateOutputStructure`, three call sites). With the template gone, the replacement is the
descriptor's per-type constructible instance — upstream clarification **Q2**, answered *yes* and
recorded as a deliberate exception, the only descriptor change feature 010 sanctioned, precisely
because this site cannot be served by per-field defaults alone. It needs a whole nested complex
type, not a scalar default.

## Observed

`ConfigManager.get_schema_descriptor(SchemaName.SCRIPT)` does emit the per-type instances —
`script:AudioCueOutputsType` and `script:VideoCueOutputsType`, the latter carrying
`output_geometry`, `corners` and `canvas_region`. The capability exists. **Its shape is not the
shape the same library writes on the wire**, in three independent ways:

| | Descriptor `instance` | `to_wire()` of a real cue output |
|---|---|---|
| wrapper | none | `{"CueOutput": {...}}` |
| `channels` | `{"channel": [{"channel_num": null, "channel_vol": null}]}` | `[{"channel": {"channel_num": 0, "channel_vol": 100}}]` |
| scalars | every one `null` | values |
| `class` | `"audio"` / `"video"` | `"audio"` / `"video"` (agrees) |

The `channels` difference is not a depth detail: the two nest in opposite directions. The instance
has one object keyed `channel` holding a list; the wire has a list of objects each keyed `channel`.

## Consequence

A client that clones the instance where it used to clone the template output produces a structure
`CuemsScript.save` rejects. The frontend therefore cannot use Q2's capability as-is for the site Q2
was granted for. Since `project_save` sends the whole script back, the rejection is not partial: the
operator loses the save, not just the new output.

This is also the second instance of the same mismatch class in this ecosystem. `generate_example`
renders the *same* document family differently again (booleans as `"True"`/`"False"` strings,
`ui_properties` scalars as `"0"` / `"None"` — `cuems-editor tests/ws-command-responses.txt`, the
`initial_template` deltas). Three renderings of one model, two of which a client must not mix.

## Workaround taken, and its cost

`cuems-frontend` 001 adds **one** named transform that lifts the descriptor instance into wire
shape: it adds the `CueOutput` wrapper, inverts the `channels` nesting, and fills scalars from the
descriptor's own per-field `default` values. Every value still originates in the descriptor — no
value is hand-authored here, which was the explicit constraint on this work.

The cost is that this repository now encodes knowledge of a projection it does not own, in a
language the schema is not written in. That is the drift the descriptor cutover exists to end, so
the transform is written as a single function with this report's identifier in its comment, to be
deleted in one edit.

## Expected

Either of these closes the report:

1. **The instance in `to_wire()` shape** — wrapper, `channels` nesting and scalar defaults as the
   wire carries them, so a client can clone it directly; or
2. **A published projection** — a documented call that takes a type key and returns a
   wire-shaped empty instance, so the mapping lives in the library that owns both shapes.

(1) is preferable from here: it needs no new public surface, and it makes "the descriptor answers
the question the template used to answer" true without a second call to learn about.

**Not expected**: per-field defaults alone. They already work for the scalar sites (`master_vol`
100, `dmx_channels` `None`, `opacity` 100 — all measured and all consumed). This report is only
about the constructible nested instance.
