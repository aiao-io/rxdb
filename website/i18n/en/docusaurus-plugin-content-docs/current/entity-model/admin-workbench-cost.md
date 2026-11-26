---
id: admin-workbench-cost
title: "Integration cost log: React Admin app template"
sidebar_label: Integration cost (admin-workbench-cost)
description: Source baseline, dependencies, style entry points, and the pending real-world integration cost validation for the React Admin app template (US-528)
---

# Integration cost log: React Admin app template

The integration vehicle is [rxdb-admin-template-react](https://github.com/aiao-io/rxdb/tree/main/apps/rxdb-admin-template-react).
The template is currently incubating inside the Nx workspace and provides a default asset scenario, model-driven pages, search, the admin shell, and backup/restore.
See its [README](https://github.com/aiao-io/rxdb/blob/main/apps/rxdb-admin-template-react/README.md) for the app scope and acceptance entry points.

This document records the code and engineering baseline of the existing template. The actual new business code, developer integration time, out-of-repo install of the published artifacts, and independent re-assembly by a trier are still to be validated,
corresponding to AC#1–#3 of [US-528](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/domain/US-528-admin-consumer-example.md).

## Closed-loop scope and evidence

[`ENTITIES`](https://github.com/aiao-io/rxdb/blob/main/apps/rxdb-admin-template-react/src/app/entities/asset-entities.ts)
registers asset categories, assets, and maintenance records. The model UI provides lists, details, forms, validation, and query filters; the app additionally wires navigation, full-text search, and backup/restore.
[`createWorkbenchDatabase`](https://github.com/aiao-io/rxdb/blob/main/apps/rxdb-admin-template-react/src/app/rxdb/setup_rxdb.ts)
uses sqlite-wasm on the main thread with IndexedDB to satisfy the current search and backup combination.

The in-repo browser closed loop is covered by `rxdb-admin-template-react-e2e`:

```bash
pnpm nx run rxdb-admin-template-react:build
pnpm nx run rxdb-admin-template-react-e2e:e2e --workers=2
```

These commands validate the template wiring through workspace sources and in-repo dependencies; they do not prove the published tarballs install and run outside the repo.
The current app batch does not implement independent replication, nor does it substitute browser tests for public-package consumer acceptance.

## Current dependency entry points

The direct dependencies are as listed in the template [package.json](https://github.com/aiao-io/rxdb/blob/main/apps/rxdb-admin-template-react/package.json):

| Package                                                       | Role in the template                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| `@aiao/rxdb`                                                  | Entities, metadata, and database                              |
| `@aiao/rxdb-adapter-sqlite-wasm`                              | Adapter used by current local persistence, search, and backup |
| `@aiao/rxdb-react`                                            | Provider and reactive queries                                 |
| `@aiao/rxdb-model-react`                                      | Model-driven entity UI                                        |
| `@aiao/rxdb-admin` / `@aiao/rxdb-admin-react`                 | Admin shell, layout, and preferences                          |
| `@aiao/rxdb-plugin-history`                                   | Form history and undo / redo                                  |
| `@aiao/rxdb-plugin-search` / `@aiao/rxdb-plugin-search-react` | Full-text search                                              |
| `@aiao/rxdb-devtools`                                         | Debug entry for development mode                              |
| `@aiao/rxdb-test`                                             | E2E database isolation naming helper for the current repo     |
| `lucide-react` / `rxjs`                                       | Icons and the reactive runtime                                |

Style development dependencies are Tailwind, daisyUI, and `@tailwindcss/vite`. React, React DOM, React Router, Vite, TypeScript,
and the related types and tooling come from the current workspace configuration. This list records the in-repo wiring, not a complete standalone project dependency table validated by an out-of-repo install.

## Source baseline

The measurement target is the template's existing `src/`, excluding `*.spec.*` / `*.test.*`; blank lines and comments are included. The current baseline is **1,058 lines**,
which is not the amount of new business code, and cannot be directly subtracted from a minimal CRUD page to derive savings.

| File                                  | Lines |
| ------------------------------------- | ----- |
| `src/app/app-config.ts`               | 14    |
| `src/app/app.tsx`                     | 85    |
| `src/app/backup/backup-ops.ts`        | 87    |
| `src/app/entities/asset-entities.ts`  | 112   |
| `src/app/entities/entity-registry.ts` | 47    |
| `src/app/pages/backup-page.tsx`       | 193   |
| `src/app/pages/entity-list-page.tsx`  | 31    |
| `src/app/pages/entity-shell.tsx`      | 28    |
| `src/app/pages/search-page.tsx`       | 69    |
| `src/app/pages/start-page.tsx`        | 22    |
| `src/app/router.tsx`                  | 54    |
| `src/app/rxdb/setup_rxdb.ts`          | 55    |
| `src/app/shell/record-search.ts`      | 49    |
| `src/app/shell/workbench-menu.tsx`    | 65    |
| `src/app/shell/workbench-shell.ts`    | 87    |
| `src/main-root.ts`                    | 7     |
| `src/main.tsx`                        | 24    |
| `src/styles.css`                      | 29    |

Re-verify the current source count at the repository root:

```bash
python3 - <<'PY'
from pathlib import Path

root = Path('apps/rxdb-admin-template-react')
total = 0
for source in sorted((root / 'src').rglob('*')):
    if not source.is_file() or '.spec.' in source.name or '.test.' in source.name:
        continue
    count = len(source.read_text().splitlines())
    total += count
    print(source.relative_to(root), count)
print('total', total)
PY
```

`app.config.json`, HTML, Vite config, tests, requirement gates, and documentation are outside this `src/` scope.
The actual business integration cost still requires recording changed files, incremental line counts, dependencies, configuration steps, and time spent under the same task before AC#2 can be closed.

## Style entry points

The template [styles.css](https://github.com/aiao-io/rxdb/blob/main/apps/rxdb-admin-template-react/src/styles.css)
uses the following entries and then declares the available themes through the daisyUI plugin:

```css
@import 'tailwindcss';
@import '@aiao/rxdb-model-react/tailwind.css';
@import '@aiao/rxdb-admin-react/tailwind.css';
@import '@aiao/rxdb-admin/admin.css';
```

Tailwind must scan the utility classes used inside the package components. For the model components' published build style requirements see the
[`@aiao/rxdb-model-react` README](https://github.com/aiao-io/rxdb/blob/main/packages/rxdb-model-react/README.md);
both the in-package style sources and the published artifact styles need re-verification in an actual consuming project — do not assume out-of-repo resources are complete based on the current workspace build alone.

## Open acceptance items

- AC#1: install the actual published tarballs in isolation, confirm dependencies, styles, and WASM, and get entry, editing, filtering, and refresh-reopen working.
- AC#2: record the new code and integration work for the same real business task; the template's total code listing only provides a baseline.
- AC#3: have a trier re-assemble it independently from the docs, recording steps, problems, time spent, and manual wiring saved.

These acceptance items stay in US-528 and are not marked complete by the app rename or the template's local regression passing.
