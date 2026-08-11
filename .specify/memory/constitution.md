<!--
Sync Impact Report
- Version change: 2.0.0 → 2.0.1
- Modified principles: none (wording preserved)
- Added sections: none
- Removed sections: none
- Templates requiring updates:
  - ✅ .specify/templates/plan-template.md (Constitution Check placeholder replaced with concrete gates for Code Quality, Testing Standards, User Experience Consistency, and Performance Requirements)
  - ✅ .specify/templates/spec-template.md (no changes needed — already requires measurable success criteria, accessibility, and scope)
  - ✅ .specify/templates/tasks-template.md (no changes needed — task categorization remains principle-agnostic)
- Follow-up TODOs: none
-->
# RxDB Constitution

## Core Principles

### I. Code Quality

All shipped code MUST compile under TypeScript strict mode with zero compiler errors
and zero ESLint warnings. The `any` type is forbidden; use `unknown` with type
narrowing or generics. Maximum nesting depth is 3 levels; extract a function before
adding a fourth. Each function and class MUST have a single responsibility.

Contributors MUST fix root causes rather than adding defensive fallbacks that hide
defects. Added abstractions, fallback layers, or branching complexity MUST be
justified in Complexity Tracking before implementation; workaround code that masks
missing upstream contracts MUST be removed or rejected.

TSDoc MUST be present on every exported symbol in `packages/*`. Dead code,
commented-out code, and TODOs without a linked issue are forbidden. Any intentional
API break, warning waiver, or compatibility exception MUST be documented in the spec,
plan, and migration notes before implementation.

Rationale: This repository spans generators, adapters, UI bindings, and demos.
Strict typing, shallow nesting, and single responsibility catch defects at compile
time and keep code reviewable. Hidden debt propagates across packages quickly.

### II. Testing Standards

Every feature, bug fix, and refactor with behavioral impact MUST follow TDD:
red → green → refactor. Tests MUST fail for the intended reason before implementation
begins, or reuse an existing failing regression test with explicit confirmation in the
plan. Every bug fix MUST include a regression test that fails without the fix.

Coverage gates: core packages (`rxdb`, `rxdb-model`, adapters, plugins) MUST maintain
at least 90% coverage; all other packages MUST maintain at least 80%. Unit,
integration, and end-to-end coverage MUST be sized to the blast radius of the change.

Tests MUST be deterministic: no `setTimeout` races, no uncontrolled network calls, no
shared mutable state between test cases. Unit tests use Vitest. E2E tests use
Playwright. Test files MUST be named `*.spec.ts` and co-located with source.

Designs MUST choose the simplest structure that satisfies the requirement. If the
simplest approach is hard to test, that signals a design problem — fix the design,
not the test.

Rationale: Local-first behavior, sync flows, and cross-framework integrations are
too easy to misjudge by manual validation. TDD forces design-first thinking.
Coverage gates prevent regressions. Deterministic tests keep CI trustworthy.

### III. User Experience Consistency

When the same capability is exposed in Angular, React, and Vue, naming, behavior,
state handling, and examples MUST remain functionally equivalent unless the
specification explicitly approves divergence. No framework gets a feature the others
lack.

Public API shape — function names, parameter signatures, observable contracts — MUST
be symmetrical across frameworks. UI components (Entity Table, Entity Detail, Query
Builder, etc.) MUST produce visually identical output given the same data, verified by
cross-framework E2E tests.

Every user-visible change MUST define loading, empty, error, and accessibility
behavior (WCAG 2.1 AA), and the affected demos or docs MUST be updated wherever users
discover that capability.

Breaking changes to user-visible behavior are forbidden without a documented migration
path. "Never break userspace."

Rationale: Users pick a framework; they MUST NOT pick a subset of features. API
parity reduces documentation burden and prevents ecosystem fragmentation.
Cross-framework consistency is a product promise, not an implementation preference.

### IV. Performance Requirements

Each spec and plan MUST define measurable performance targets for the affected path
and the validation method used to prove them.

Default budgets unless the plan records an approved exception:

| Metric             | Budget     |
| ------------------ | ---------- |
| Query execution    | < 16 ms    |
| Database operation | < 100 ms   |
| Package bundle     | < 50 KB gz |
| First paint (demo) | < 1.5 s    |

Performance regressions that exceed these budgets block merge and MUST be treated as
failed acceptance criteria, not deferred polish. Benchmarks in `benchmarks/` MUST
cover critical paths and run on every PR that touches `packages/*`.

Lazy loading and tree-shaking MUST be preserved; no side-effect imports at package
root. Changes that touch queries, adapters, sync, rendering, or bundle composition
MUST include benchmark, profiling, or measured timing evidence in the plan or review
notes.

Rationale: Instant local-first interactions are a core value of this project.
Hard budgets prevent incremental bloat and keep the library competitive.
Performance debt compounds faster than API debt.

## Engineering Guardrails

- Primary delivery targets: TypeScript 5.9+, Nx 22+, pnpm 10, Angular 21+, React 19+, Vue 3.5+, RxJS 7.8+. Changes require a constitutional amendment.
- Specs for user-visible work MUST state accessibility expectations, parity scope, and measurable performance expectations before planning can complete.
- Public examples, generated outputs, and framework bindings MUST stay aligned with the same semantic contract.

## Delivery Workflow

- Non-trivial work MUST flow through spec, plan, tasks, and implementation in that order.
- The Constitution Check in each plan MUST explicitly cover code quality, test scope, user experience consistency, and performance budgets.
- Tasks MUST include the verification work required to prove the story, including regression tests, parity validation, documentation or demo updates, and performance checks when applicable.
- Pull requests and reviews MUST reject work that lacks required tests, leaves user-visible states undefined, or ships without the measurements required by the plan.

## Governance

This constitution supersedes local habits, template defaults, and informal team
preferences. Operational guidance in AGENTS.md, CONTRIBUTING.md, and README.md MAY
add detail, but it MUST NOT weaken any principle defined here.

Amendments MUST update this file and every affected template, agent instruction, or
contributor-facing guide in the same change. Versioning follows semantic versioning:
MAJOR for incompatible principle removals or redefinitions, MINOR for new principles
or materially expanded obligations, and PATCH for clarifications that do not change
required behavior.

Compliance review is mandatory for every spec, plan, tasks file, and pull request.
Any exception MUST name the violated principle, explain why the exception is
necessary, identify the simpler alternative that was rejected, and record the
approval path in the relevant artifact.

**Version**: 2.0.1 | **Ratified**: 2026-04-09 | **Last Amended**: 2026-05-13
