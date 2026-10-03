<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# Feature Specification: Schema-Descriptor Migration

**Feature Branch**: `feat/xml-refactor` (spec directory `001-schema-descriptor-migration`)

**Created**: 2026-10-03

**Status**: Draft

**Input**: Carry this repository's consumer half of the CueMS XML refactor across the wire
`cuems-editor` 001 now serves. The verbatim context block is
[`specs/planning/xml-refactor/00-runnable-flow.md`](../planning/xml-refactor/00-runnable-flow.md) §3;
the binding documents are `01-settled-decisions.md` (D17/D18b, D21, D25, D26, D27, D35),
`02-consumer-audit-findings.md` (C3, C5, C8), `03-migration-inventory.md`, `04-wire-contract.md`,
`05-amendment-2026-10-02.md` and `06-amendment-feature-014.md`. Phase zero is characterization
tests; the port is measured against them, not asserted.

---

## Clarifications

### Session 2026-10-03

- **Q: Where does the structure for a new cue's outputs come from, now that the descriptor's
  per-type instance exists but is not in wire shape?** → A: From the descriptor, through one named
  transform that produces wire shape (adds the output wrapper, inverts the channel nesting, fills
  scalars from descriptor defaults). Every value still originates in the descriptor — this is not a
  hand-authored seed. The upstream report asking for a wire-shaped instance is filed so the
  transform has a single, documented deletion point.
- **Q: Does a new DMX cue keep today's one-channel seed, or adopt the descriptor's empty default?**
  → A: Keep the one-channel seed. It is what operators see today, and it is recorded explicitly as
  a UI-level starting value that deliberately differs from the descriptor's default rather than as
  a schema default.
- **Q: What happens to the three config domains that have no editing UI (`settings`,
  `project_settings`, `project_mappings`), given that saving them is blocked upstream?** → A: Build
  read-only views for all three, each named for the domain it shows. No save path is built in this
  feature; that path is registered as a dependent requirement of upstream report **UR-5** and
  recorded as not performed with UR-5 as the reason.
- **Q: On a payload-version mismatch, how much of the UI stays usable?** → A: A global block. One
  guard at the application shell shows a full-screen refusal naming both versions and what to do;
  no project, media, mixer or configuration screen renders at all. The shell itself stays alive so
  the refusal is readable and the language switcher works. Reasoning: nearly every screen here
  reads wire payloads, so a per-screen guard would be one guard per surface and the first one
  missed would render misread values as though they were data.
- **Q: What exactly gets cleared when the payload version differs?** → A: Only the wire-payload
  cache, which is moved under one reserved key prefix and evicted by prefix. Per-operator
  preferences — the chosen language, the floating panel's position — live outside that namespace and
  survive. Reasoning: eviction has to be complete, and a hand-maintained list of key names can
  forget an entry, which is the same stale-cache hazard in a new form. A namespace makes
  completeness structural: anything cached there later is covered without anyone remembering to add
  it.
- **Q: After a reconnect invalidates the acknowledgement, how should the refused save be handled?**
  → A: Re-acknowledge automatically **only if this session already showed the operator a report with
  the id the refusal names**, then retry the save once and say that it happened. If the operator was
  never shown that report, show it and wait for confirmation first. Reasoning: the connection
  auto-reconnects on error, so this is routine rather than exceptional, and the operator may be
  holding unsaved edits; but acknowledgement must keep meaning "a human read this", so a report no
  one has seen is never auto-confirmed.
- **Q: If the schema descriptor never arrives, what can the operator still do?** → A: Nothing in the
  project domain. An absent or unusable descriptor is a hard prerequisite failure, handled by the
  same shell gate as a version mismatch: project editing is blocked and the reason is stated. Both
  the starting values and the output structure come from the descriptor, so every creation path may
  rely on its presence rather than carrying a fallback. This is a deliberately broad blast radius,
  chosen over a narrower creation-only gate so that no code path can silently substitute its own
  defaults for the schema's.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Today's behaviour is pinned before anything moves (Priority: P1)

A developer about to port the three largest untouched files first records what they do today, by
running them against payloads recorded from a real editor rather than invented ones. Afterwards,
any difference the port introduces is something a test reports, not something a reviewer has to
notice.

**Why this priority**: This is finding C8 and decision D35, and it is the instrument every later
story is measured with. The repository has 6 spec files against 112 other TypeScript files, and
none of them covers the sequence editor, the projects service or the settings component. Until these
exist, a green suite evidences nothing about this feature's blast radius, and "the port is
equivalent" is an opinion. The sibling precedent (`cuems-utils` feature 008 characterizing
`cuems-nodeconf`'s network-map logic before moving it) is the model: the characterization file then
ran unchanged against the new API, and equivalence was demonstrated rather than argued.

**Independent Test**: Run the suite on an unmodified working tree. It passes, and it now exercises
the adopt/unadopt path, the cue-type ladder and save wrapper, the five template reads including all
three output-structure call sites, and the projects service's payload intake and cache round trip.
Delivers value on its own: the repository gains coverage of its three most business-critical files
whether or not the port proceeds.

**Acceptance Scenarios**:

1. **Given** the recorded pre-001 project frame, **When** it is fed to the sequence editor's cue
   intake, **Then** the test records the cue list, types and per-cue values it produces today.
2. **Given** the recorded `initial_mappings` payload, **When** it is fed to the projects service,
   **Then** the test records the mapping options produced and the cache entry written.
3. **Given** a node list in which a node is adopted and a second is not, **When** the adopt and
   unadopt controls are exercised, **Then** the test records the emitted request and the component
   state each response produces — including which controls are enabled.
4. **Given** the characterization suite passes, **When** the ported code replaces the old code,
   **Then** the same test files pass with only their input fixtures swapped for recorded new-wire
   payloads; no expected behaviour is edited to accommodate the new code.

---

### User Story 2 - An operator opens and saves a project against the 001 editor (Priority: P2)

An operator opens a project containing audio, video and DMX cues, changes something, and saves. The
project opens with its cues named, typed and populated, and the save succeeds.

**Why this priority**: Measured, today's UI **cannot save at all** against the 001 editor. The
library accepts a payload keyed by the old per-type cue names on ingest and then refuses it at save,
so the operator gets an error frame on every attempt. Everything else in this feature is an
improvement; this is the restoration of the primary task.

**Independent Test**: Against a running 001 editor, open a project with one cue of each hardware
class plus an action cue and a fade cue, edit a value, save, reload, and confirm the change
persisted.

**Acceptance Scenarios**:

1. **Given** a project whose hardware cues arrive under the single cue key with a `class` field,
   **When** the project opens, **Then** every cue shows its name, type and values, and no cue is
   dropped or shown as empty.
2. **Given** that project, **When** the operator saves, **Then** the editor accepts it and no error
   frame is produced.
3. **Given** a cue whose `class` is one this UI has no editor for, **When** the project opens,
   **Then** the cue is listed and identified by its class rather than discarded, nothing errors, and
   saving the project preserves that cue unchanged.
4. **Given** a media cue, **When** its duration is displayed in the sequence list and in the edit
   panel, **Then** a timecode is shown — never `[object Object]`.
5. **Given** a saved project, **When** the payload is inspected, **Then** it carries no
   `schemaLocation` key and each cue's enabled flag is a native boolean.

---

### User Story 3 - New cues are built from the schema descriptor (Priority: P3)

An operator adds an audio, video or DMX cue to a project. The new cue arrives with sensible starting
values and a complete output structure, as it did when the editor still sent a concrete template.

**Why this priority**: `initial_template` is retired and no longer sent. Every template consumer is
therefore reading either a stale cached copy or nothing, which makes new-cue creation quietly
degraded today: output structure comes back empty and starting values fall back to this
component's own magic numbers.

**Independent Test**: With the cache cleared, add one cue of each type to an empty project and
confirm each arrives complete and saves.

**Acceptance Scenarios**:

1. **Given** a connected session, **When** the descriptor for the script schema is requested,
   **Then** every template consumer reads from it and none reads the retired template frame or its
   cached copy.
2. **Given** a new audio cue, **When** it is created, **Then** its master volume is the descriptor's
   default of 100, not the previous fallback of 20 — at every site that resolves that value.
3. **Given** a new audio or video cue, **When** its outputs are built, **Then** the structure is in
   wire shape at all three creation paths, and no path produces an undefined structure.
4. **Given** a new DMX cue, **When** it is created, **Then** it opens with one channel row, as
   today.
5. **Given** a descriptor that does not carry a type or field a call site asks for, **When** that
   site runs, **Then** it reports the gap rather than silently producing an empty or partial cue.
6. **Given** an editor that never answers with a descriptor at all, **When** the operator tries to
   work on a project, **Then** project editing is blocked with the reason stated, through the same
   gate a version mismatch uses — not worked around with local default values.

---

### User Story 4 - A repaired document is visible, acknowledged, and then saveable (Priority: P4)

An operator opens a project the backend had to repair or convert. They are told what was changed,
they confirm it, and the project then saves. If a project cannot be loaded at all, they are told
which document and which field, and what their three options are.

**Why this priority**: This is D21, and the editor now enforces it from its side: a repaired or
converted project's save is **refused** until the session acknowledges the report. Without an
acknowledge step in this UI, such projects simply cannot be saved — the operator sees a failure with
no path forward. This repository is also the only place a repair becomes visible at all; a silent
repair is the exact outcome the three-outcome design exists to prevent.

**Independent Test**: Open a project the editor reports as repaired, confirm the report is shown,
acknowledge it, save, and confirm the save succeeds. Then open a project the editor cannot load and
confirm the named field and all three recovery options are shown.

**Acceptance Scenarios**:

1. **Given** a project that loads cleanly, **When** the report arrives, **Then** the operator is not
   interrupted, and the fact that the load was clean is available rather than merely implied.
2. **Given** a project reported as repaired or converted, **When** it opens, **Then** the operator
   sees what was changed, field by field, before they edit anything.
3. **Given** that report has not been acknowledged, **When** the operator saves, **Then** the refusal
   is explained in terms of the report and the operator is offered the acknowledgement, not shown a
   bare error.
4. **Given** the operator acknowledges the report, **When** they save again, **Then** the save
   succeeds.
5. **Given** the operator acknowledged a report and the connection then dropped and reconnected
   while they had unsaved edits, **When** they save, **Then** the save completes without asking them
   to confirm the same report again, they are told the reconnection was handled, and no edit is
   lost.
6. **Given** a refusal naming a report this session never showed the operator, **When** it arrives,
   **Then** the report is shown and confirmed before anything is acknowledged.
7. **Given** a report flagged as differing from the file on disk, **When** it is shown, **Then** the
   operator is told the file needs saving to become what they are looking at.
8. **Given** a save whose original document could not be preserved, **When** the refusal arrives,
   **Then** the operator is told plainly that nothing was written.
9. **Given** a project that cannot be loaded, **When** the failure arrives, **Then** the document,
   the offending field and all three recovery options are shown, and the project stays listed and
   the session usable.

---

### User Story 5 - Node adoption keeps working across the node-list split (Priority: P5)

An operator on the controller adopts a newly discovered node and un-adopts one that is leaving. Both
succeed against the real node daemon, and the screen keeps telling them two different things about
each node: whether discovery can see it, and whether it is answering right now.

**Why this priority**: This screen is in daily use and this is a **port, not a rebuild** (D26). The
nodes and the daemon-availability flag have moved to a new frame, so today's reads land on the wrong
frame; measured, that leaves the Adopt button dead for every node, which is a dead control rather
than a cosmetic defect. The two presence facts are already deliberately unmerged here, and the port
must keep them apart.

**Independent Test**: Against a real controller, adopt a new node and un-adopt an adopted one
through this screen, and confirm the node daemon acted in both cases.

**Acceptance Scenarios**:

1. **Given** a connected session, **When** the node list arrives, **Then** the adoption screen shows
   the adopted and newly discovered nodes from that frame, and the adopt controls' availability
   follows the daemon-availability flag carried in it.
2. **Given** a node discovery can see, **When** the screen renders, **Then** its discovery presence
   and its sub-second liveness are shown as two distinct facts, never merged into one indicator.
3. **Given** a node discovery can see and an available daemon, **When** the operator adopts it,
   **Then** the request is sent, the daemon's success response updates the screen, and a failure
   relays the daemon's own message.
4. **Given** the controller node, **When** the screen renders, **Then** un-adopting it is not
   offered.
5. **Given** the map contains a duplicate node identity, **When** the error arrives, **Then** it is
   shown on the adoption screen, and it clears when the condition clears.
6. **Given** the daemon-availability flag is absent from the frame, **When** the screen renders,
   **Then** the adopt controls are treated as unavailable rather than available.

---

### User Story 6 - Mixers and default outputs read the current mapping shape (Priority: P6)

An operator opens the audio or video mixer for a project and sees the nodes and their outputs. A new
cue is created pointing at the configured default output rather than at nothing.

**Why this priority**: The mapping document changed shape, so both mixer filters now match nothing
and every default-output read resolves to undefined. The mixers go empty and new cues arrive with no
target, which means they never arm on any node.

**Independent Test**: Open both mixers against a controller whose map includes more than one device
class, and create one audio and one video cue, confirming each lands on the configured default.

**Acceptance Scenarios**:

1. **Given** a mapping node carrying devices of several classes, **When** a mixer renders, **Then**
   it shows that node's outputs for its own class, and a class it does not handle is ignored without
   error.
2. **Given** the mapping document's defaults, **When** a new audio or video cue is created, **Then**
   it is pointed at the default output for its class and direction.
3. **Given** a default entry carrying no port text, **When** it is read, **Then** nothing is shown as
   a default and no placeholder value is invented.

---

### User Story 7 - A version mismatch is refused, and a stale cache never renders (Priority: P7)

An operator whose browser holds a cache from before the upgrade, or who is pointed at an editor of a
different vintage, is told so plainly instead of being shown wrong values.

**Why this priority**: This repository is not packaged, so the ecosystem's release gate cannot reach
it: the connection handshake is its **only** gate. And the browser cache is the one hazard in this
whole change that no server-side fix can reach — a server cannot clear another origin's storage. Two
screens read the cached mapping payload directly, bypassing the service that would have refetched
it, and the retired template's cached copy can now never be refreshed at all.

**Independent Test**: Load the UI with a cache written before the upgrade and confirm no screen
renders from it. Point the UI at a peer announcing a different payload version and confirm the
refusal.

**Acceptance Scenarios**:

1. **Given** a session connecting to an editor announcing a payload version this UI does not
   implement, **When** the handshake completes, **Then** the operator is told both versions and what
   to do on one screen, no project, media, mixer or configuration screen renders at all, and the
   shell behind it stays usable enough to read the message and change language.
2. **Given** a peer that never announces a version at all, **When** the session connects, **Then** it
   is treated as the pre-upgrade wire and refused the same way.
3. **Given** a cache written with a different payload version, **When** the session connects,
   **Then** every cached payload is discarded before any screen reads one, **and** the operator's
   language choice and panel position are still what they were.
4. **Given** a cache with no version recorded beside it — the state of every browser in the field
   today — **When** the session connects, **Then** it is discarded on that basis alone.
5. **Given** an operator who rolled the editor back to an older version, **When** the session
   connects, **Then** the newer cache is discarded too; eviction follows any difference, not only an
   older one.
6. **Given** the retired template's cache entry, **When** the upgrade runs, **Then** it is deleted
   rather than migrated, and nothing reads it afterwards.

---

### User Story 8 - An operator can inspect the controller's configuration (Priority: P8)

An operator opens a read-only view of the controller's settings, the project's settings, or the
project's output mappings, and sees what the controller actually holds — rendered from the schema
descriptor, each view named for the document it shows.

**Why this priority**: Lowest, because it adds a capability rather than restoring one, and because
the write half cannot be built at all until upstream publishes a way to ingest a config document
from JSON (**UR-5**). Read-only still removes a real blind spot: today an operator has no way to see
these documents, and the mixers already consume one of them.

**Independent Test**: Open each of the three views against a real controller and confirm the values
shown match the documents on disk.

**Acceptance Scenarios**:

1. **Given** a connected session, **When** the operator opens each of the three config views,
   **Then** each shows its document's fields and values, rendered from the descriptor rather than a
   hand-maintained form.
2. **Given** any of those views, **When** the operator looks for a way to change a value, **Then**
   none is offered, and the view states that editing is not yet available.
3. **Given** the view names, **When** a developer reads them, **Then** each names the document it
   shows, and none repeats the existing mistake of a view named for one domain that operates on
   another.
4. **Given** node adoption, **When** these views ship, **Then** adoption is unaffected: it continues
   through its own request, not through a config save.

---

### Edge Cases

- A cue arrives with a `class` this UI has never seen. It is listed, identified, preserved on save,
  and is not an error — the vocabulary is open by design.
- A video cue that had no opacity in its document now arrives carrying the schema's default. Nothing
  may treat the presence of that value as evidence the operator set it.
- A node carries no identity fields at all (a partially migrated map). It still renders under a
  stable fallback label rather than blank.
- A node has no devices, or only devices of a class no mixer handles. The mixers show it as empty
  rather than failing.
- A mapping default carries no port text. No default is offered and none is invented.
- The daemon-availability flag is absent. Adopt controls are unavailable, not available.
- The duplicate-identity error clears. The adoption screen stops showing it.
- A liveness poll fails. A node's liveness reads as unknown, never as dead.
- The save is refused for a reason other than an unacknowledged report — a zero-length fade
  duration, or a cue pointing at a deleted cue. The operator sees the editor's own message naming
  the offending cue.
- A project is loaded in another session or by the boot auto-load. Anything that must be live reads
  the engine's broadcast rather than the once-per-connection status (FR-019).
- The cached payload cannot be parsed. It is discarded without blocking startup.
- The descriptor is **unavailable** entirely. Project editing is blocked at the shell with the
  reason stated, exactly as a version mismatch is — not degraded to local defaults.
- The descriptor **arrives but is incomplete** for a type a creation path needs. The gap is
  reported rather than absorbed into a partial cue.
- A repaired project is acknowledged in one browser tab and saved from another. The second session's
  save is still refused — acknowledgement is per session and a fresh load issues a fresh report. That
  second session has not shown its operator the report, so it shows it rather than auto-confirming.
- The connection drops and reconnects between acknowledging a report and saving. The save is retried
  once behind a re-sent acknowledgement, and the operator keeps their unsaved edits.
- A save is refused twice for the same report. The second refusal reaches the operator instead of
  retrying again.

## Requirements *(mandatory)*

### Phase zero — characterization, before any port (D35)

- **FR-001**: The three files with no coverage — the project-edit sequence component, the projects
  service and the settings component — MUST each gain a spec file that pins today's behaviour
  **before** any porting change is made to them, and the two must be separable in the history:
  the characterization commit precedes the port commit.
- **FR-002**: Characterization tests MUST be driven by payloads recorded from a real editor —
  `cuems-editor`'s 001 evidence directory holds the pre-001 project frame, the mapping payload and
  the last template payload — and MUST NOT be driven by hand-invented fixtures.
- **FR-003**: The characterized surface MUST include, at minimum: the adopt and unadopt requests
  and the subscription that consumes their responses; the liveness poll and both presence badges;
  the daemon-availability greying, including which controls it disables; the five template reads in
  the sequence component with all three output-structure call sites; the cue-type ladder and the
  save wrapper, for every cue type; and the projects service's template and mapping intake including
  the cache round trip and the nullable-payload paths.
- **FR-004**: Characterization tests MUST pass against the ported code with no change to their
  expected behaviour. Where the wire itself changed, the test's **input fixture** MAY be replaced
  with a recorded new-wire payload; its expectations MUST NOT be edited to accommodate the new code.
  A genuine inability of the new code to reproduce the old behaviour MUST be recorded as a finding,
  not resolved by adjusting the test.
- **FR-004a**: Exactly **two** expectation changes are sanctioned, and both MUST be named in writing
  **before** the port begins — master volume 20 → 100 (FR-032) and `canAdopt` flipping from
  false-for-every-node once the booleans are JSON (FR-057). Both are *intended* operator-visible
  changes this feature exists to make, not accommodations of ported code, and both are pinned in
  `contracts/characterization-rules.md`. Any third divergence is a finding under FR-004, never a
  test edit, and the sanctioned pair MUST NOT be extended once the port has begun.
- **FR-005**: No test in this repository may assert the behaviour of the node model itself; that
  model lives upstream and is reached only through the editor's wire.

### The project round trip

- **FR-010**: Hardware cues MUST be written on save under the single cue key carrying a `class`
  field, and their outputs likewise, so that the editor accepts the payload. Action cues, fade cues
  and the cue list keep their own keys and carry no class.
- **FR-011**: Every read that identifies a cue or a cue output by its old per-type key MUST be
  migrated to the key-plus-class form, in all of: the project-edit sequence component's read side
  and output reads, the project-show sequence component's identity, name, type and data reads, and
  the shared audio mixer's output volume read and write.
- **FR-012**: A cue whose class this UI has no editor for MUST be listed and identified, MUST NOT
  cause an error, and MUST survive a save unchanged.
- **FR-013**: Internal vocabulary — type unions, icons, translation keys, routes — MAY keep the
  words audio, video and dmx; those are not wire keys. This requirement exists to bound FR-011, not
  to mandate renaming.
- **FR-014**: Media duration MUST be displayed as a timecode at **both** display sites — the
  project-show sequence list and the project-edit panel's media duration method — unwrapping the
  wrapper the wire now carries, following the pattern the fade path already uses in both directions.
- **FR-015**: The project payload interface MUST NOT declare the absent schema-location key, and no
  save MUST send that key back; a payload still carrying it is refused by the editor.
- **FR-016**: A cue's enabled flag MUST be written as a native boolean. (Measured: the string form
  is accepted today and **refused** after the upstream boolean retyping, while the native form is
  accepted on both sides — so this change is safe to land now and is what unblocks that upstream
  feature.)
- **FR-017**: Nothing may treat the presence of a video cue's opacity value as evidence an operator
  set it; the schema default now arrives where the document had no value.
- **FR-018**: The dual boolean read on cue intake MUST remain correct across the upstream boolean
  retyping. Retiring its string half is explicitly deferred (see Out of Scope).
- **FR-019**: The once-per-connection project status MUST NOT be treated as live. `project_status`
  is queried once per WebSocket connection, so a load performed elsewhere — another tab, the power
  bridge's boot auto-load — is invisible to it until this client reconnects; anything that must be
  live MUST keep reading the engine's OSC broadcast (`oscService.loadedProject()`), which the engine
  sends on every change. The port MUST preserve that separation rather than collapsing the two, and
  the reconnect owner (FR-044a) MUST re-query `project_status` when it re-runs the session
  prerequisites, because a reconnect is the moment the stale value can be replaced.

### Building new cues from the descriptor

- **FR-030**: All four template-consuming files MUST read from the schema descriptor, and none MUST
  read the retired template frame or its cached copy. The retired frame's response handling and its
  cache entry MUST be removed, not left unreachable.
- **FR-032**: Every site that reads a concrete field value MUST read it from the descriptor's
  defaults rather than from a local literal. Measured, those are the **three** sites that resolve a
  new audio cue's master volume — the creation path, the intake path and the write-back path — and
  all three MUST yield the descriptor's default of 100. (A separate FR-031 stated this in the
  abstract without naming the sites; it was folded in here, where they are enumerated.) This
  replaces a fallback of 20 and is therefore a **behaviour change visible to operators**: a newly
  created audio cue starts five times louder than it did before. It MUST be recorded as such in the
  release notes for this change, not merely in the code.
- **FR-033**: The structure for a new cue's outputs MUST be derived from the descriptor's per-type
  instance through one named transform that produces wire shape — supplying the output wrapper,
  inverting the channel nesting, and filling scalars from descriptor defaults. The transform MUST be
  the single place that knowledge lives, so that it can be deleted in one edit when the upstream
  instance becomes wire-shaped.
- **FR-034**: None of the three output-structure call sites may produce an undefined structure. A
  descriptor that arrives but does not carry a type or field a call site asks for MUST surface a
  reported gap rather than a silently empty or partial cue.
- **FR-034a**: The descriptor is a **hard prerequisite for the project domain**. A descriptor that
  is absent, unanswered or unusable MUST block project editing through the same shell gate as a
  version mismatch (FR-070a), stating the reason; it MUST NOT be worked around with a local
  fallback, a cached copy, or a creation-only restriction. Consequently every creation path MAY rely
  on the descriptor being present, and MUST NOT carry its own default values as a fallback.
- **FR-034b**: The version gate (FR-070a) and the descriptor gate (FR-034a) MUST share one gating
  mechanism at the shell, so that a prerequisite added later is enforced in one place rather than
  per screen.
- **FR-035**: The structure MUST NOT be hand-authored locally. Every value in it originates in the
  descriptor.
- **FR-036**: An upstream report MUST be filed with `cuems-utils` requesting the per-type instance in
  wire shape (or a published projection), and it MUST be filed **before** planning, so the transform
  in FR-033 is recorded as a temporary adapter with a known removal trigger rather than as this
  repository's own design.
- **FR-037**: A new DMX cue MUST start with one channel, preserving today's behaviour. This
  deliberately differs from the descriptor's default of none, MUST be recorded as a UI-level
  starting value rather than a schema default, and MUST NOT be presented as the schema's answer.

### The repair report and the save gate

- **FR-040**: The load report that follows every successful project load MUST be surfaced, including
  for a clean load — a clean outcome MUST be discoverable rather than only implied by the absence of
  a warning.
- **FR-041**: A repaired or converted outcome MUST show the operator what was changed, field by
  field, before they edit anything.
- **FR-042**: The flag that says the file on disk differs from what was loaded MUST be shown as
  "this file needs saving", because a load never writes and the same repair otherwise recurs on
  every open and reads as a bug.
- **FR-043**: The session MUST be able to acknowledge a report by its identifier, and the UI MUST
  offer that acknowledgement to the operator, because the editor refuses to save a repaired or
  converted project until this session acknowledges that specific report.
- **FR-044**: A save refused as unacknowledged MUST be explained in terms of the report and MUST
  offer the acknowledgement; after acknowledgement, the save MUST succeed.
- **FR-044a**: Acknowledgement does not survive a reconnect, and the connection reconnects
  automatically on error. When a save is refused naming a report this session has **already shown
  the operator**, the session MUST re-send the acknowledgement for the id the refusal names, retry
  the save once, and tell the operator that it did so. The operator MUST NOT lose unsaved edits to a
  transient drop.
- **FR-044b**: When a save is refused naming a report this session has **not** shown the operator,
  the report MUST be shown and confirmed before any acknowledgement is sent. An acknowledgement MUST
  never be sent for a report no human has been shown — that would make the gate a formality and
  defeat the reason it exists.
- **FR-044c**: The retry in FR-044a MUST happen at most once per refusal; a second refusal MUST
  surface to the operator rather than loop.
- **FR-045**: A refusal reporting that the original document could not be preserved MUST tell the
  operator plainly that nothing was written.
- **FR-046**: A project that cannot be loaded MUST show the document, the offending field, the
  library's message and **all three** recovery options; the project MUST stay listed and the session
  usable.
- **FR-047**: A duplicate-project-source report accompanying a duplication reply MUST be surfaced the
  same way as a load report.

### Node adoption across the node-list split

- **FR-050**: The adoption screen's node list and its daemon-availability flag MUST come from the
  dedicated node-list frame — which arrives on connect, on every map change, after each adoption
  request, and as the reply to an explicit query — and no longer from the mapping payload.
- **FR-051**: Adopt and unadopt MUST keep working end to end against the real node daemon through
  the ported screen, preserving the existing request shape and treating the daemon's response shape
  as a contract, relaying its error text verbatim.
- **FR-052**: Discovery presence (~30 s) and sub-second liveness MUST remain two separately labelled
  facts and MUST NOT be merged into a single indicator or a single boolean.
- **FR-053**: A failed liveness poll MUST render as unknown, never as dead.
- **FR-054**: An absent daemon-availability flag MUST disable the adopt controls. (Today's
  "anything but an explicit false means available" reading turns a missing flag into a comfortable
  lie; at this payload version the flag is always present when the frame is, so absence is a fault,
  not a default.)
- **FR-055**: Un-adopting the controller MUST NOT be offered. The guard MUST test the node's current
  role field; the element it tests today was renamed upstream, so the guard is permanently satisfied
  and the control is wrongly enabled — including for the controller, which the daemon then refuses.
  This is an independent pre-existing defect and is in scope here because the same file is being
  ported.
- **FR-056**: The duplicate-identity error MUST be shown on the adoption screen, and MUST clear when
  the condition clears.
- **FR-057**: The strict boolean read of a node's discovery presence MUST be correct against the wire
  this repository actually ships against. (Shipping with or after the upstream boolean retyping — which
  the coordinated tag enforces — it is already correct and MUST be left alone; shipping before it
  would require the transitional dual read. The characterization test for the adopt guard is what
  tells these two cases apart.)
- **FR-058**: Any new per-domain view MUST be named for the document it operates on. The existing
  settings-named screen that edits the node map is the mistake not to repeat.

### Mapping and mixer reads

- **FR-060**: Default outputs MUST be read from the mapping document's defaults collection, selected
  by class and direction, with the port text read from its text-content key — replacing the retired
  per-class default fields on the interface and every site that reads them.
- **FR-061**: A default entry carrying no port text MUST yield no default; no placeholder value may
  be invented.
- **FR-062**: Every read of a mapping node's per-class output blocks MUST move to the devices
  collection, selected by class. Measured 2026-10-03, there are **five** such sites, not the two the
  planning bundle lists. They are, counted as research R2's table counts them — one row per symbol
  or symbol pair in one file:
  1. the cue-output option builder in the projects service;
  2. the output lookup in the projects service;
  3. the adoption screen's two output getters (one site, one file, both getters);
  4. the project-show audio mixer;
  5. the project-show video mixer.

  All five degrade silently to an empty list today, and the first of them blanks **every cue's
  output selector**, so a migration that covers only the mixers leaves the most consequential site
  broken. Any restatement of this count MUST use these five rows, so that "all five" means the same
  thing in the spec, in research R2 and in the task list.
- **FR-062a**: The devices collection nests one level deeper than the fields it replaces (a device's
  outputs are a list of lists). A migration that only renames the key MUST NOT be considered
  complete; each site MUST be verified against a recorded payload.
- **FR-063**: A device class a mixer does not handle MUST be ignored without error; the class
  vocabulary is open.
- **FR-064**: Both mixers MUST obtain the mapping payload through the service that can refetch it,
  rather than reading the browser cache directly, so that FR-070's eviction cannot be bypassed.

### The handshake and the cache

- **FR-070**: The session MUST act on the payload version the editor announces as the first frame of
  every connection. A version this UI does not implement MUST produce a refusal that names both
  versions and tells the operator what to do. A peer that never announces a version MUST be treated
  as the pre-upgrade wire and refused on the same basis.
- **FR-070a**: The refusal MUST be a **single global gate at the application shell**: while a
  mismatch stands, no project, media, mixer or configuration screen renders. The gate MUST NOT be
  implemented as a per-screen condition, because a surface that forgets it would present misread
  values as data — the outcome the handshake exists to prevent.
- **FR-070b**: The shell MUST remain alive behind the gate, so the refusal is readable and the
  language selection still works. The refusal MUST NOT be a blank screen: a mismatch that renders
  nothing is no better than rendering a wrapped value as an object.
- **FR-071**: The payload version MUST be stored alongside every cached payload, inside the same
  namespace as the payloads (FR-071a).
- **FR-071a**: Every wire-payload cache entry MUST live under **one reserved key prefix**, and
  eviction MUST clear that whole prefix rather than a list of individual key names. Per-operator
  preferences (the chosen language, the floating panel's position) MUST live outside that prefix and
  MUST survive eviction untouched. Rationale: a hand-maintained list can omit an entry added later,
  which reproduces the stale-cache hazard; a namespace covers a future payload by construction.
- **FR-072**: On connect, the whole payload namespace MUST be discarded when the stored version
  differs from the announced one **in either direction** — a rolled-back editor leaves a newer cache
  against an older server, which is the same hazard.
- **FR-073**: A cache with no stored version MUST count as differing and be discarded. This is the
  state of every browser in the field today and is precisely the population this must clear.
- **FR-074**: The retired template's cache entry MUST be deleted rather than migrated, together with
  the code that reads it; an entry for a frame the server no longer sends can never be refreshed and
  will never expire on its own.
- **FR-075**: Eviction MUST happen before any screen reads a cached payload.
- **FR-076**: An unparseable cache entry MUST be discarded without blocking startup.
- **FR-077**: The payload version and the on-disk document version MUST stay distinct; the document
  version never reaches this repository and MUST NOT be introduced here.

### Read-only config views

- **FR-080**: Read-only views MUST be provided for the controller settings document, the project
  settings document and the project mappings document, each rendered from the schema descriptor
  rather than a hand-maintained form, and each named for the document it shows (FR-058).
- **FR-081**: These views MUST NOT offer a way to change a value, and MUST state that editing is not
  yet available.
- **FR-082**: The **save path for these three views is a dependent requirement of upstream report
  UR-5** (no public way to build a config document from JSON): the editor's config-save answers an
  error for all four config domains until that upstream call exists. This feature MUST (a) register
  this repository's save-path dependency against UR-5, so the report records the frontend views as a
  blocked consumer alongside the editor's own need, and (b) record the save path as **not performed**
  with UR-5 as the stated reason. The views MUST be built so that enabling save is the only
  remaining change when UR-5 is answered.
- **FR-083**: Node adoption MUST continue through its own request and MUST NOT be routed through a
  config save, before or after UR-5.
- **FR-084**: No config-domain save may be attempted against the editor in this feature; it would
  only earn an error frame.

### Recording

- **FR-090**: Every item in this specification that cannot be performed MUST be recorded as **not
  performed**, per entry, with its reason. Silence is not an acceptable third state.
- **FR-091**: The decisions this specification settles — the output-structure transform and its
  upstream report, the DMX seed, the master-volume change, the cache-eviction rule, the config-save
  deferral — MUST be recorded with their reasons where a future reader of the code will find them.
- **FR-092**: This repository's half MUST NOT be released on its own; it ships with the coordinated
  tag alongside the editor's half (D27).

### Key Entities

- **Project frame**: the document an operator edits. Differs from the pre-upgrade frame by four
  enumerated deltas: no schema-location key; wrapped media duration; hardware cues and cue outputs
  under a single key with a `class`; and a default opacity where a video document had none.
  Everything else — every other key, the ordering — is unchanged.
- **Schema descriptor**: the replacement for the retired concrete template. Per type: field names,
  types, cardinality, enumerated values, **model-layer defaults**, and a constructible empty
  instance. Measured defaults relevant here: master volume 100, DMX channels none, opacity 100.
- **Mapping document**: output mappings only, since the untangling. Carries defaults selected by
  class and direction, and nodes whose outputs live in a class-tagged devices collection.
- **Node list**: adopted nodes, newly discovered nodes, and the daemon-availability flag. The flag is
  an envelope fact sampled when the frame is built — not a property of any node or document.
- **Load report**: the outcome of every load — clean, converted or repaired — with the conversions
  and field-level repairs applied, a report identifier, and whether the file on disk differs from
  what was loaded. Its identifier is what a save-acknowledgement refers to; a fresh load issues a
  fresh one.
- **Two liveness facts**: discovery presence, refreshed about every 30 seconds, and sub-second
  liveness, which is what the engine's go gate trusts. Distinct, and shown apart.
- **Cached payload**: a browser-local copy of a wire payload, living under one reserved key prefix
  with the payload version beside it. A cache, never a source of truth, and the one surface in this
  change no server-side fix can reach. Distinct from a **per-operator preference** (language, panel
  position), which is not a payload, lives outside that prefix, and is never evicted.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The test suite is green and contains three spec files that did not exist before,
  covering the three files this feature rewrites; the characterization commit is dated before the
  port commit.
- **SC-002**: No characterization expectation was edited to make ported code pass, beyond the two
  divergences sanctioned in writing before the port began (FR-004a); where fixtures changed, they
  were replaced with recorded payloads and the change is identifiable in the history.
- **SC-003**: An operator opens a project containing audio, video and DMX cues against the current
  editor, edits it, and saves successfully — the task that cannot be completed at all today.
- **SC-004**: Zero duration fields render as `[object Object]`, at both display sites, for every cue
  type including a cue with no media file selected.
- **SC-005**: An operator creates one cue of every type in an empty project with the cache cleared;
  each arrives with complete starting values and outputs, and the project saves.
- **SC-006**: A repaired project is opened, the operator sees what changed, acknowledges it in one
  step, and the save then succeeds; an unloadable project shows the named field and all three
  recovery options while the session stays usable.
- **SC-007**: Adopt and unadopt both succeed end to end against a real node daemon through the
  ported screen, with both presence facts reading correctly for every node and the adopt control
  live for a node discovery can see.
- **SC-008**: Both mixers list every node and output a controller's map actually declares, including
  a node carrying a device class no mixer handles.
- **SC-009**: A browser holding a cache written before the upgrade renders no screen from it; a
  session pointed at a peer announcing a different payload version shows the refusal and renders no
  project data. Both are demonstrated, the refusal against a version other than the current one.
- **SC-010**: Each of the three config documents can be inspected in a view named for it, and no
  save is attempted from any of them.
- **SC-011**: Every item not performed is recorded with its reason, per entry — including the
  config-save path against UR-5 — with no silent omissions.
- **SC-012**: The operator-visible behaviour changes this feature introduces are enumerated in one
  place for release: new audio cues start at volume 100 rather than 20, the adopt control becomes
  live again, un-adopting the controller is no longer offered, cached payloads are cleared on first
  connect after upgrade while language and panel preferences are kept, and an editor that is the
  wrong version or sends no schema descriptor now blocks the project screens with a stated reason
  instead of rendering.

## Out of Scope

Each entry is a deliberate exclusion with its reason, per FR-090.

- **Retiring the string half of the cue intake's dual boolean read.** Correct on both sides of the
  upstream boolean retyping, so nothing breaks by leaving it. Explicitly a follow-up, not a blocker.
  (The *write* side is in scope and mandatory — FR-016.)
- **The autoload and timecode flags.** Measured: already written natively and never read from the
  wire anywhere in this repository. Correct before and after the upstream change.
- **Any node-model implementation or test.** Lives upstream exclusively; a node-model test appearing
  here would be a regression, not coverage (FR-005).
- **Media pixel dimensions and file size.** Measured: this repository rebuilds the media object on
  save and ignores unknown keys on load; the editor fills these server-side afterwards.
- **The OSC encoding of cue-enabled as 1/0.** A different transport with its own encoding, correct
  as it is, and deliberately not unified with the wire's boolean form.
- **Editing the three config documents.** Blocked on UR-5; registered against that report and
  recorded as not performed (FR-082).
- **The upstream port-inventory move** that will relocate the mapping reads again. Out of scope, and
  the reason not to treat the mapping reads ported here as final.
- **Releasing from this branch.** Prohibited by D27 (FR-092).

## Dependencies & Coordination

- **Producing end, landed not shipped**: `cuems-editor` 001 on its `feat/xml-refactor` serves this
  wire today, on the upstream library release that completed the device-class reshape. Its frame list
  is the authoritative producing-end reference.
- **Blocked upstream, tracked**: UR-5 (no public config-document JSON ingestion) blocks the config
  save path, with this repository's views now registered as a dependent consumer (FR-082). A new
  report to `cuems-utils` for a wire-shaped per-type instance must be filed before planning (FR-036).
- **Simultaneity**: the native-boolean write (FR-016) is what lets the upstream boolean retyping ship;
  that retyping is what makes the string form fail. Writing natively is accepted by both the current
  and the retyped library, so this repository can land first.
- **Base**: this branch sits on the unmerged adoption/liveness tier. That tier's four commits must
  stay underneath this feature, and its behaviour — not the mainline's — is what phase zero pins.
- **Gate**: this repository is not packaged, so it carries no dependency relation and the ecosystem's
  release gate cannot reach it. The connection handshake (FR-070) is its only gate.
- **Not available from here**: the characterization payloads come from a sibling working copy. If
  that directory is unavailable, payloads MUST be recaptured from a running editor rather than
  invented (FR-002).

## Assumptions

- **The planning bundle's line numbers are stale; its sites are not.** Verified 2026-10-03 against
  the current branch tip: the project-edit sequence component is 1803 lines (the inventory measured
  1739), the projects service 774 (696), and every coordinate has drifted by tens of lines —
  the schema-location declaration, the master-volume sites, the output-structure calls and the save
  wrapper all moved. This specification therefore identifies work by file and symbol, and planning
  MUST re-locate each site rather than trusting a quoted line number.
- Measured 2026-10-03: none of the new frames — the version handshake, the node list, the load
  report and its failure form, the acknowledgement, the descriptor request, the duplicate-identity
  error — appears anywhere in this repository's source. All of User Stories 4, 7 and 8 is new
  surface, not modification.
- This repository ships **with or after** the upstream boolean retyping, which the coordinated tag
  enforces. FR-057 and FR-018 are written on that basis; shipping earlier would change both.
- The descriptor's measured defaults (volume 100, DMX channels none, opacity 100) are treated as
  authoritative for field values. Where this feature deliberately diverges, it says so and says it
  is a UI-level choice (FR-037).
- The browser cache keyed on payload version is the eviction mechanism, the version being the natural
  key already present as the first frame. Four ways this is got wrong are each a requirement:
  clearing only on an older version rather than any difference, treating a missing version as
  acceptable, migrating the retired template entry instead of deleting it, and scoping eviction to a
  hand-kept list of key names that a later addition can escape (FR-071 to FR-074).
- An operator's browser is assumed to allow local storage, and to fail soft when it does not: the
  cache is a convenience, so a browser that cannot store it must still work (FR-076).
- Existing translation coverage is assumed to extend to new operator-facing text, per the project's
  standing convention that user-facing strings are translated in all maintained locales.
- Whether the editor should serve partial document elements on demand, rather than this repository
  holding or computing whole payloads client-side, is recorded as a **design option to weigh during
  planning**. It is not a requirement of this specification and does not change any acceptance
  criterion above.
