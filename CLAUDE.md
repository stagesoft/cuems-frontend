# cuems-frontend

Part of the **CUEMS** ecosystem — see the [`cuems-RELATIONS`](https://github.com/stagesoft/cuems-RELATIONS) repo for the system index, architecture diagram, and protocol/port map.

## Role

Browser-based authoring UI for CUEMS (Angular 19, project name `formitgo-tw`). Talks to `cuems-editor` over WebSocket JSON. Served as a static SPA from `/var/www` on the controller behind Apache2.

Local dev needs an untracked config `src/app/core/config/app-config.json` (copy from `.example`; set `websocketBaseUrl`).

## Cue-mode labels

The sequence view maps the engine's `post_go` field to labels in `sequence.component.ts:107-109` (`pause`→Auto pause, `go`→Auto continue, `go_at_end`→Auto follow). Full semantics in the cuems-engine CLAUDE.md. Node labels fall back to `Node ${index + 1}` when both `alias` and `role_id` are absent in `network_map.xml` — so partial node-identity migrations are safe.

## Deploy / "Updating the UI"

When asked to "update the UI", run in order:
1. `git fetch` — fetch latest.
2. List incoming commits (`git log --oneline HEAD..@{u}`) and present them before proceeding.
3. `git pull`.
4. `ng build` — production bundle (`dist/formitgo-tw/browser/`).
5. `sudo cp -r dist/formitgo-tw/browser/* /var/www/` — `/var/www` is root-owned.

**Deploy gotcha — never `rsync --delete` into `/var/www`.** `/var/www` holds a hand-placed `.htaccess` (Angular SPA routing fallback: `FallbackResource /index.html` + rewrite rules) that is **NOT** part of `ng build` output. `rsync --delete` wipes it → every deep-linked/refreshed route 404s. Use plain `cp -r` (additive, the procedure above). To prune stale hashed bundles instead, `rsync --delete --exclude='.htaccess'` or restore `.htaccess` afterward; always `tar czf` a backup of `/var/www` first. On boxes where the SSH alias logs in as `cuems-admin` (sudo needs a password) but `stagelab` owns the repo/node_modules/`/var/www`, deploy as `stagelab` (no sudo).
