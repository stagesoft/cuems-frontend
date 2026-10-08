# cuems-frontend

Part of the **CUEMS** ecosystem — see the [`cuems-RELATIONS`](https://github.com/stagesoft/cuems-RELATIONS) repo for the system index, architecture diagram, and protocol/port map.

## Role

Browser-based authoring UI for CUEMS (Angular 19, project name `formitgo-tw`). Talks to `cuems-editor` over WebSocket JSON. Served as a static SPA from `/var/www` on the controller behind Apache2.

Local dev needs an untracked config `src/app/core/config/app-config.json` (copy from `.example`; set `websocketBaseUrl`).

## Cue-mode labels

The sequence view maps the engine's `post_go` field to labels in `sequence.component.ts:107-109` (`pause`→Auto pause, `go`→Auto continue, `go_at_end`→Auto follow). Full semantics in the cuems-engine CLAUDE.md. Node labels fall back to `Node ${index + 1}` when both `alias` and `role_id` are absent in `network_map.xml` — so partial node-identity migrations are safe.

## Next-cue names in the transport

`OscService.engineCueNames` is fed by `/engine/status/cue_name/<uuid>` (cuems-engine branch `fix/869fedahu-cue-names-broadcast` or later; the engine sends it after `/engine/status/load`, so the table is cleared on every load change and on disconnect) and is **authoritative** for "Siguiente cue". The page-fed `cueNames` (show sequence page) is only the fallback for older engines. Never merge the two: duplicated projects share cue uuids, so a page-fed name can belong to the wrong project.

## Lists changed by other sessions

The editor broadcasts `{"type": "list_update", "value": "project_list" | "project_trash_list" | "file_list" | "file_trash_list"}` to every *other* session when a list changes (create, save, duplicate, upload, trash, restore, delete). `ProjectsService` and `MediaService` refetch the named list on it; nothing else may decide when a list is stale. A list refresh re-runs the edit page's media rematch, which only fills empty `selectedMediaFile` slots and records that resolution per cue in the unsaved-changes baseline — never a whole-array snapshot (869fej3kv).

## A cue's media on save

The edit page never drops a cue's `Media` block. A file picked from the library replaces it; otherwise the ORIGINAL block is kept as is, even when the file is in the media trash or the list has not loaded yet (dropping it used to erase the cue's media on save — ClickUp 869fej07m). Both save paths run `findMediaCueProblems`: a cue with no usable block or a trash-deleted file blocks the save; a trashed file only warns. The warning icon in the sequence table is decided against the *current* library list (`ui_properties.warning` arrives as the string "None" when unset — see `normalizeUiWarning`).

## Deploy / "Updating the UI"

When asked to "update the UI", run in order:
1. `git fetch` — fetch latest.
2. List incoming commits (`git log --oneline HEAD..@{u}`) and present them before proceeding.
3. `git pull`.
4. `ng build` — production bundle (`dist/formitgo-tw/browser/`).
5. `sudo cp -r dist/formitgo-tw/browser/* /var/www/` — `/var/www` is root-owned.

**Deploy gotcha — never `rsync --delete` into `/var/www`.** `/var/www` holds a hand-placed `.htaccess` (Angular SPA routing fallback: `FallbackResource /index.html` + rewrite rules) that is **NOT** part of `ng build` output. `rsync --delete` wipes it → every deep-linked/refreshed route 404s. Use plain `cp -r` (additive, the procedure above). To prune stale hashed bundles instead, `rsync --delete --exclude='.htaccess'` or restore `.htaccess` afterward; always `tar czf` a backup of `/var/www` first. On boxes where the SSH alias logs in as `cuems-admin` (sudo needs a password) but `stagelab` owns the repo/node_modules/`/var/www`, deploy as `stagelab` (no sudo).

<!-- SPDX-FileContributor: Ion Reguera <ion@stagelab.coop> -->
