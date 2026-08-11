# aiao_ai Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-15

## Active Technologies

- TypeScript 5.9+ strict mode, ESM + `@sqliteai/sqlite-wasm` (locked version `3.50.4-sync.1.0.13-vector.0.9.95-memory.0.9.0`), `comlink` ^4.4.2, `rxjs` ^7.8.2, `@aiao/rxdb`, `@aiao/utils` (004-rxdb-adapter-sqliteai)

## Project Structure

```text
apps/
benchmarks/
docker/
examples/
modules/
packages/
requirements/
research/
scripts/
specs/
website/
```

## Commands

pnpm run test-all
pnpm nx run-many -t build test lint --projects=packages/*

## Code Style

TypeScript 5.9+ strict mode, ESM: Follow standard conventions

## Recent Changes

- 004-rxdb-adapter-sqliteai: Added TypeScript 5.9+ strict mode, ESM + `@sqliteai/sqlite-wasm` (locked version `3.50.4-sync.1.0.13-vector.0.9.95-memory.0.9.0`), `comlink` ^4.4.2, `rxjs` ^7.8.2, `@aiao/rxdb`, `@aiao/utils`

- Workspace is a pnpm + Nx monorepo; prefer `pnpm nx ...` over plain npm scripts for package-scoped build, test, and lint tasks

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
under `specs/<feature-id>/` (create one via `/speckit-plan` if absent).
<!-- SPECKIT END -->
