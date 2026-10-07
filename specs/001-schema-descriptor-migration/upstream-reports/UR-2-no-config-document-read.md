<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# UR-2 — No way to read a config document's current contents

**To** `cuems-editor`. **From** `cuems-frontend` 001 (schema-descriptor migration), 2026-10-07.
**Measured** against `cuems-editor` `feat/xml-refactor` @ `22093fd` (research R10).

## Observed

The editor can *write* all four config domains — `config_save` for `settings`, `network_map`,
`project_mappings` and `project_settings`, through `ConfigManager.from_json` (UR-5, closed) — but
offers no action that returns their current contents. `schema_descriptor` answers the schema, not
the values; `initial_mappings` is `default_mappings.xml`, which is neither a project's
`mappings.xml` nor a `config_save` target; `node_list` is the merged node view, not the
`network_map` document.

## Consequence

A client can describe a config document but cannot show what the controller holds, and cannot
offer to edit it: `config_save` replaces the whole document, so a form that starts from blanks or
schema defaults would overwrite a working configuration with them. `cuems-frontend` therefore ships
the three config views read-only and descriptor-only, with editing recorded as not performed
against this report.

## Expected

A read action symmetric to `config_save`, e.g.

    {"action": "config_load", "value": {"schema": "<name>", "project_uuid": "<uuid>"?}}
      -> {"type": "config_load", "value": {"schema": "<name>", "document": {...}}}

with `document` in the same JSON form `config_save` accepts (so a client can round-trip it), and
`project_uuid` required for `project_mappings` / `project_settings` exactly as `config_save`
requires it. A missing file (the ordinary state of a project's `settings.xml` before it is ever
saved — compare UR-6) should answer an explicit "no document yet" rather than the error frame, so
a client can tell "empty" from "failed".

## Consumers

- `cuems-frontend` `src/app/components/config/` — the three views' value half, and editing.
