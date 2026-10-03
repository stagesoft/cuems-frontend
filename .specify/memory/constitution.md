<!--
Sync Impact Report
Version change: (unratified template scaffold) → 1.0.0
Rationale: MAJOR — first ratified constitution for this project; all content is new.
Modified principles: n/a (initial ratification, no prior ratified text existed)
Added sections:
  - Core Principles I–VII (Contract Consumer Not Owner; Partial & Asynchronous State;
    This Is Where a Human Finds Out; Tests Gate New and Changed Code, Not the Legacy
    Backlog; LocalStorage Is a Cache, Never a Source of Truth; Two Liveness Facts, Shown
    Apart, Never Merged; i18n Through ngx-translate Is Load-Bearing)
  - Technology & Architecture Constraints
  - Development Workflow & Deployment Safety
  - Governance
Removed sections: none
Deferred / TODO placeholders: none — RATIFICATION_DATE set to the date of this ratification
  since no prior constitution was ever ratified for this project.
Templates requiring follow-up: none checked in this run (scope of this command is the
  constitution file only, per the Scope Guard). Dependent templates/commands read this file
  at runtime and are not modified here.
This comment is scratch material for human review of the amendment and is expected to be
removed before/when this file is next amended.
-->

# cuems-frontend Constitution

## Core Principles

### I. Contract Consumer, Not Owner
This repository does not define the shape of the data it displays. Payload shape is set by
`cuems-editor`, which in turn derives it from cuemsutils' schemas; this repo can only track
that contract, never change it. Consequently:

- Field reads MUST be defensive: tolerate the representations the backend is actually known
  to emit (e.g. a boolean arriving as `=== true || === 'True'`) rather than assuming a single
  canonical encoding.
- Code MUST NOT assume a field is present, of a given type, or absent of legacy quirks, merely
  because a TypeScript interface declares it so — interfaces here document an expectation, not
  a compile-time guarantee the wire enforces.
- A schema mismatch is data to display or degrade gracefully around, not an exception to let
  propagate uncaught.

Rationale: every fix for a "wrong value" bug that targets this repo's parsing logic instead of
treating the mismatch as a defensive-read gap is solving the wrong layer.

### II. State Arrives Asynchronously and Partially
Signals here hold nullable payloads that fill in over time; localStorage holds copies that can
be older than the schema the current session expects. A component MUST NOT assume that a
payload-derived value is present, complete, or fresh.

- Every signal fed by a WS response MUST have an explicit "not yet known" state distinct from
  "known to be empty," and templates MUST handle that state rather than dereferencing through it.
- Partial identity data (e.g. a node with no `alias`/`role_id`/`hostname`) MUST degrade to a
  documented fallback (e.g. `Node ${index + 1}`) rather than render undefined/blank/throw.

Rationale: the recurring bug shape in this codebase is a component written as if its inputs were
synchronous and complete; this is the generalization of the node-identity fallback already in
place and the node-label pattern used by `ProjectsService.getNodeLabel` and `nodeLabel`.

### III. This Is Where a Human Finds Out
This repository is the operator's entire view of the system. It holds no database and no files;
if something happens on the backend — a corrupt document gets repaired, a load is refused, a
node drops off discovery — this UI is the only place that becomes visible to a person, or it is
lost entirely.

- Any backend-side repair, refusal, error, or degraded response MUST reach the operator through
  visible UI feedback (notification, inline state, banner) proportionate to its severity.
- `catch` blocks and `console.error`/`console.warn` calls MUST NOT be the sole handling for a
  failure that a human needs to act on. Silent swallowing is a regression, not a cleanup.

Rationale: a UI with no backend state of its own has exactly one chance to tell someone that
something went wrong; "I logged it to the console" is equivalent to "no one will ever know."

### IV. Tests Gate New and Changed Code, Not the Legacy Backlog
As of this ratification the repository has 6 spec files against roughly 112 TypeScript files,
and its three largest, most business-critical components (including the 1800-line sequence
editor) have none. That is a known, named debt — not a backlog this constitution pretends to
clear retroactively, and not a standard waived the moment it is inconvenient.

- Any new component, service, or handler file MUST ship with a spec file covering its
  non-trivial behavior.
- Any change to an existing file's behavior MUST add or update a covering spec in the same
  change, unless the change is confined to markup/styling with no logic branch affected.
- Writing characterization tests against an existing untested component (fixing the coverage
  gap on code being touched anyway) satisfies this rule — it is the rule being honored, not an
  exception carved out for it.
- A PR that touches business logic in an untested large component without adding any coverage
  MUST justify why characterization was infeasible, in the PR description.

Rationale: a blanket "all code must be tested" rule would be waived on sight given the current
ratio; a gate on the diff is the version of this rule that actually holds.

### V. LocalStorage Is a Cache, Never a Source of Truth
`initial_template` and `initial_mappings` are both cached in localStorage today. A cache that
outlives a schema change is exactly how this UI ends up showing the wrong shape after an
upgrade — and `cuems-editor` has already stopped sending `initial_template` at all, so a stale
cached copy of it is now permanent until manually cleared.

- Any value read from localStorage MUST be treated as provisional and MUST be overwritten in
  full the moment a fresher value arrives over the WS connection.
- Code MUST NOT assume a cached value matches the shape the current session's backend sends;
  reads of cached values are subject to Principle I's defensive-read rule, not exempt from it.
- A feature MUST remain correct (possibly in a degraded "waiting for data" state, per Principle
  II) if the relevant cache key is absent, empty, or carries a shape from a prior schema
  version — including keys the backend has since stopped sending entirely.

Rationale: localStorage exists here to survive a page reload between WS messages, not to
outlive the contract in Principle I.

### VI. Two Liveness Facts, Shown Apart, Never Merged
A node has two distinct liveness signals with different latencies and different consumers: the
discovery-level `online` flag (cuems-nodeconf, refreshed on a ~30 second cycle) and
`node_status.alive` (sub-second, the fact the GO gate actually trusts). Collapsing them into one
boolean or one label erases the distinction that makes either of them useful.

- Wherever both facts are relevant to a screen (adoption, node settings, anything gating GO),
  they MUST be surfaced as two separately labeled facts, not merged into a single indicator.
- Code MUST NOT substitute one for the other as a shortcut (e.g. gating an action on `online`
  when the actual requirement is sub-second liveness, or vice versa).

Rationale: `online` answers "does discovery still see this MAC," `alive` answers "would the
engine let this node go right now" — conflating them produces a UI that is confidently wrong
for up to 30 seconds at a time.

### VII. i18n Through ngx-translate Is Load-Bearing, Not Decorative
`@ngx-translate/core` is wired up with three maintained locale files (`en`, `es`, `ca`) and is
already used across templates and components, not merely installed.

- User-facing strings introduced or changed in templates and components MUST go through the
  translate pipe/service rather than being hardcoded.
- A new or changed translation key MUST be added to all three maintained locale files in the
  same change, not left to fall back silently in two of them.

Rationale: this is an existing, enforced convention with real infrastructure behind it, not an
aspirational standard the repo doesn't otherwise hold itself to — unlike a11y, for which no
such standard or tooling exists here today, so none is asserted.

## Technology & Architecture Constraints

- The application is an Angular 19 standalone SPA, package name `formitgo-tw`, styled with
  Tailwind 4, internationalized with `@ngx-translate`.
- All live data arrives over a single WebSocket JSON connection to `cuems-editor` (default port
  9092), with OSC traffic (`osc-js`) carried alongside it. This repo owns no REST API and no
  database.
- This repo persists nothing of its own beyond the browser's localStorage, which is a cache
  (Principle V) and never authoritative.
- Local development requires the untracked `src/app/core/config/app-config.json`, copied from
  `.example` with `websocketBaseUrl` set — see CLAUDE.md, which is authoritative for this and
  other day-to-day setup/operational detail this constitution does not duplicate.

## Development Workflow & Deployment Safety

- Review of any change MUST check Principles I–VII against the diff, not the repository as a
  whole — in particular, the test gate in Principle IV is evaluated against changed/added code.
- Deployment ("updating the UI") follows the fixed procedure already checked into CLAUDE.md
  (`git fetch` → review incoming commits → `git pull` → `ng build` → copy into `/var/www`). The
  one invariant that procedure exists to protect, and that MUST NOT be violated by any deploy
  script or ad hoc command: `/var/www` carries a hand-placed `.htaccess` that `ng build` does not
  reproduce, so deploying with `rsync --delete` (unqualified) destroys Angular's SPA routing
  fallback for every deep-linked route. Use additive `cp -r`, or `rsync --delete` with
  `--exclude='.htaccess'`, and back up `/var/www` first.

## Governance

This constitution governs the principles and non-negotiable constraints for cuems-frontend.
CLAUDE.md remains authoritative for operational, day-to-day procedure (the deploy steps, local
config setup, the cue-mode label mapping) that this document references but does not restate.

- **Amendments**: any change to this file's principles, constraints, or governance text is an
  amendment. Amendments are made by editing this file directly and MUST update the Sync Impact
  Report comment at the top of the file and the version/date footer below.
- **Versioning policy** (semantic versioning applied to this document):
  - MAJOR: a principle is removed or redefined in a way that is backward-incompatible with
    prior guidance.
  - MINOR: a new principle or section is added, or existing guidance is materially expanded.
  - PATCH: wording, clarification, or non-semantic fixes.
- **Compliance review**: PRs and reviews are expected to check touched code against Principles
  I–VII (see Development Workflow above). A reviewer who finds a violation treats it the same
  as any other review finding — it blocks merge or is explicitly accepted with a stated reason
  in the PR.

**Version**: 1.0.0 | **Ratified**: 2026-10-03 | **Last Amended**: 2026-10-03
