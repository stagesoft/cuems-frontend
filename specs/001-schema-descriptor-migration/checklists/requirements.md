<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# Specification Quality Checklist: Schema-Descriptor Migration

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-03
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

Validated 2026-10-03, two passes: once at specification, once after `/speckit-clarify` added four
answers. 8 user stories (P1–P8), **68** functional requirements, 12 measurable outcomes, 16 edge
cases, 8 explicit out-of-scope entries. Zero `[NEEDS CLARIFICATION]` markers and zero unreplaced
template tokens (verified by grep). All 16 items passed at both passes; no item changed state.

Four deliberate deviations from the generic criteria, recorded rather than smoothed over:

1. **File-and-symbol anchors are kept in the requirements.** This feature is a migration of named
   existing code, not a greenfield capability: "the project-edit sequence component's save wrapper"
   is *what the requirement is about*, and a requirement phrased without it would not be testable.
   Line numbers were deliberately **excluded** — the planning bundle's coordinates were measured on
   an earlier base and have all drifted (verified against the current tip; see the first Assumption
   in the spec), so quoting them would rot the spec. Planning re-locates each site.

2. **Wire-frame and payload vocabulary is domain language, not implementation detail.** The payload
   contract originates in `cuemsutils`' schemas and is served by `cuems-editor`; this repository
   cannot change it, only track it (constitution Principle I). Naming the frames is naming the
   business constraint. Internal technology choices — how a view is rendered, how a transform is
   structured, how the cache is keyed in code — are left to planning.

3. **SC-001 and SC-002 are process-measurable, not product-measurable.** They assert that
   characterization tests exist and that their expectations were never edited to accommodate the
   port. That is deliberate: D35 makes the *order of work* an outcome of this feature, and
   constitution Principle IV gates changed code on tests. A criterion that only measured the
   finished product would make phase zero unverifiable, which is the one thing finding C8 says
   cannot be allowed.

4. **Three requirements prescribe structure, not just outcome** — one gating mechanism at the shell
   (FR-034b, FR-070a), one key prefix for the payload cache (FR-071a), one transform for the output
   shape (FR-033). Each is phrased that way because the *correctness* argument is structural: a
   per-screen gate can be forgotten on one screen, a hand-kept eviction list can omit a key added
   later, and knowledge spread across three call sites cannot be deleted in one edit when upstream
   fixes the instance. These were chosen by the project owner during clarification, not inferred.

Clarifications resolved at specification (session 2026-10-03), each previously listed in
`00-runnable-flow.md` §5 as a question `/speckit.clarify` must force:

| | Question | Resolution |
|---|---|---|
| §5 Q1 | the output structure's source of shape | descriptor instance through one named wire-shape transform, upstream report filed as its removal trigger (FR-033, FR-036) |
| §5 Q2 | `dmx_channels` seed or empty | keep the one-channel seed, recorded as a UI-level value that deliberately differs from the descriptor default (FR-037) |
| §5 Q12 | the three unedited config domains | read-only views for all three; the save path registered against UR-5 as a dependent requirement and recorded not performed (FR-080 to FR-082) |

Resolved by `/speckit-clarify` (same session), four questions asked and answered:

| | Question | Resolution |
|---|---|---|
| §5 Q6 | scope of the handshake refusal | one global gate at the shell; no project, media, mixer or config screen renders, the shell stays alive so the message is readable (FR-070a, FR-070b) |
| new | what remains usable when the descriptor never arrives | nothing in the project domain — a hard prerequisite through the same shell gate, no local fallback, so creation paths may assume presence (FR-034a, FR-034b) |
| §5 Q10 | acknowledgement after a reconnect | re-acknowledge and retry once **only** for a report this session already showed the operator; otherwise show it first. The connection auto-reconnects on error, so this is routine (FR-044a to FR-044c) |
| §5 Q5 | what eviction actually clears | the payload namespace by prefix; per-operator preferences live outside it and survive (FR-071a, FR-072) |

The descriptor-availability question was not in §5's list — it surfaced from the taxonomy scan,
because making the descriptor the sole source of defaults turned an optional frame into a
prerequisite and nothing said what happens without it.

Remaining `00-runnable-flow.md` §5 items stand as informed decisions in the spec: Q3 (master volume
100 adopted, named as an operator-visible change — FR-032, SC-012), Q4 (the constitution's test
gate, satisfied by phase zero — FR-001 to FR-004), Q7 to Q9 (the adoption tier is in scope as a
port, both presence facts kept apart — FR-050 to FR-057), Q11 (an unknown cue class is listed,
preserved and never an error — FR-012).
