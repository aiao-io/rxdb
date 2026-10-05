# Specification Quality Checklist: US-220 — Supabase 推送 UPDATE 的落库语义

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-05
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

- 本故事的需求本身就是远端落库语义（修改 vs 新建、权限规则、错误码），42501 / 23502、RLS、「日志」这类词是领域术语而非实现选择，
  按与 `specs/005-us-909-session-replay/spec.md` 一致的尺度保留；具体函数名、参数名、SQL 语句不出现在 FR / SC 中。
- 输入里列为「待 plan 定」的三项（下发形状、「已不存在」的错误码取值、存在性判定原语的机制）在 spec 中只约束外部行为
  （FR-005、FR-007、FR-008、FR-009、FR-011），不设 [NEEDS CLARIFICATION]：它们是 plan 阶段的技术决策，且须与 US-218 plan 一并冻结。
- SC-006 的「成功路径不多一次查询」标为**推断**，plan 阶段核实。
