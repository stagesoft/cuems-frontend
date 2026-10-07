# cuems-frontend

Part of the **CUEMS** ecosystem — see the [`cuems-RELATIONS`](https://github.com/stagesoft/cuems-RELATIONS) repo for the system index, architecture diagram, and protocol/port map.

## Role

Browser-based authoring UI for CUEMS (Angular 19, project name `formitgo-tw`). Talks to `cuems-editor` over WebSocket JSON. Served as a static SPA from `/var/www` on the controller behind Apache2.

Local dev needs an untracked config `src/app/core/config/app-config.json` (copy from `.example`; set `websocketBaseUrl`).

## Cue-mode labels

The sequence view maps the engine's `post_go` field to labels in `sequence.component.ts` (`actionTypeOptions`) (`pause`→Auto pause, `go`→Auto continue, `go_at_end`→Auto follow). Full semantics in the cuems-engine CLAUDE.md. Node labels fall back to `Node ${index + 1}` when both `alias` and `role_id` are absent in `network_map.xml` — so partial node-identity migrations are safe.

## Editor wire (payload version 1, feature 001)

Spec, findings and fixtures: `specs/001-schema-descriptor-migration/`. The shapes, in one place each:

- **Session gate** — `core/payload-version.service.ts`: `payload_version` is each connection's first
  frame (a silent peer is version 0, refused); then the `script` schema descriptor. No routed screen
  renders until both are met (`app.component.html` + `components/payload-gate`). It is also the one
  reconnect owner (`sessionStarted` / `sessionRestarted`).
- **Cache** — only through `core/payload-cache.ts` (one `cuems.payload.` prefix, evicted on any
  version change). `npm run test:ci` runs `tools/wire-guards.mjs` first: it fails on a bare
  `localStorage` payload, per-type cue keys (`AudioCue`, …), retired fields (`initial_template`,
  `node_type`, `default_*_output`, `node.audio`), `config_save`, or `doc_version` anywhere in `src/`.
- **Cues** — `core/cue-wire.ts`: hardware cues are `{"Cue": {…, "class"}}`, outputs
  `{"CueOutput": {…, "class"}}`; unknown class = kind `other`, written back as it arrived. Saves send
  `{"CuemsScript": …}` alone — the library refuses any sibling key. `enabled` is a native boolean.
- **New cues/outputs/projects** — built from the descriptor via `toWireShape` (UR-1 transform) in
  `services/projects/handlers/schema-descriptor.handler.ts`; `UR1_UI_STARTING_VALUES` fills required
  fields the descriptor leaves null. Delete both when UR-1 is answered.
- **Mappings** — `core/mapping-wire.ts`: `devices[].device` by class (outputs are a list of lists),
  `defaults[]` by class+direction. Node identity and adoption state come from `node_list`, not
  `initial_mappings`.
- **Repair gate** — `services/projects/load-report.service.ts`; a not-clean project is reloaded on
  reconnect because the editor drops its repair state (findings F22).
- **Config views** (`/config/*`) are read-only and descriptor-only until the editor can read a config
  document (UR-2).
- Booleans arrive as JSON `true`/`false` **or** `"True"`/`"False"` at the same payload version
  (findings F6): read both.

## Deploy / "Updating the UI"

When asked to "update the UI", run in order:
1. `git fetch` — fetch latest.
2. List incoming commits (`git log --oneline HEAD..@{u}`) and present them before proceeding.
3. `git pull`.
4. `ng build` — production bundle (`dist/formitgo-tw/browser/`).
5. `sudo cp -r dist/formitgo-tw/browser/* /var/www/` — `/var/www` is root-owned.

**Deploy gotcha — never `rsync --delete` into `/var/www`.** `/var/www` holds a hand-placed `.htaccess` (Angular SPA routing fallback: `FallbackResource /index.html` + rewrite rules) that is **NOT** part of `ng build` output. `rsync --delete` wipes it → every deep-linked/refreshed route 404s. Use plain `cp -r` (additive, the procedure above). To prune stale hashed bundles instead, `rsync --delete --exclude='.htaccess'` or restore `.htaccess` afterward; always `tar czf` a backup of `/var/www` first. On boxes where the SSH alias logs in as `cuems-admin` (sudo needs a password) but `stagelab` owns the repo/node_modules/`/var/www`, deploy as `stagelab` (no sudo).
