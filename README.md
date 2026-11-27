<div align="center">

# RxDB

[![PR CI](https://github.com/aiao-io/rxdb/actions/workflows/pr.yml/badge.svg?branch=main)](https://github.com/aiao-io/rxdb/actions/workflows/pr.yml)
[![npm](https://img.shields.io/npm/v/@aiao/rxdb)](https://www.npmjs.com/package/@aiao/rxdb)
[![codecov](https://codecov.io/gh/aiao-io/rxdb/graph/badge.svg?token=VJW8U2PNBG)](https://codecov.io/gh/aiao-io/rxdb)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Docs](https://img.shields.io/badge/docs-rxdb.aiao.io-0ea5e9)](https://rxdb.aiao.io/en/)

</div>

RxDB is a TypeScript data layer for local-first applications. It combines SQL storage, reactive queries, entity management, and Angular, React, and Vue integrations. The current published baseline is `v0.0.28`, and the project is still evolving in the 0.x series. See the [release plan](requirements/release-plan.md) for the published scope and the next migration release.

> This project is published under the `@aiao/*` scope and is unrelated to [`rxdb`](https://rxdb.info), the NoSQL document database on npm. Aiao RxDB provides decorator-based entities, SQL engines such as SQLite and PGlite, and bindings for three UI frameworks.

- Define entities with decorators and generate type-safe repositories and query APIs.
- Use one model declaration for database schemas, TypeScript types, and reactive data flows.
- Run SQLite directly in the browser to build offline-first applications with app-like behavior.

> The capability summary follows the current `main` branch. Admin, I18n, Board, and P2P packages are not yet part of the npm release set. Run examples from this workspace and check the [compatibility matrix](https://rxdb.aiao.io/en/docs/compatibility) before consuming published packages.

Chinese readers can use the [简体中文 README](README.zh-CN.md).

## Demo

| Framework | URL                                                            |
| --------- | -------------------------------------------------------------- |
| Angular   | [rxdb.aiao.io/demo/angular](https://rxdb.aiao.io/demo/angular) |
| React     | [rxdb.aiao.io/demo/react](https://rxdb.aiao.io/demo/react)     |
| Vue       | [rxdb.aiao.io/demo/vue](https://rxdb.aiao.io/demo/vue)         |

## What problem does RxDB solve?

Web applications often maintain database schemas, TypeScript types, state management, client-server communication, and offline behavior separately. A change in one layer then requires manual updates in several others.

RxDB brings these concerns together around one model declaration. The same entity definition drives database access, queries, changes, generated client code, and UI integration. This is useful for offline-first applications, rich data models, and strongly typed teams working across multiple frameworks.

## Core capabilities

| Capability      | Description                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------- |
| Reactive        | Data changes update the UI without a second hand-written state synchronization layer.             |
| Local-first     | Run a database in the browser and keep the application usable during weak or absent connectivity. |
| Type-safe       | Derive type-safe queries, mutations, and client APIs from model definitions.                      |
| Data-driven     | Model trees, graphs, and other structured data with generated CRUD capabilities.                  |
| Cross-framework | Use consistent concepts across Angular, React, and Vue.                                           |
| Collaborative   | Evolve toward versioned data, synchronization, and multi-user workflows.                          |

Related projects include [Jazz](https://jazz.tools/), [LiveStore](https://github.com/livestorejs/livestore), and [PowerSync](https://github.com/powersync-ja/powersync-js).

## Technology

| Layer            | Technology                                                                        |
| ---------------- | --------------------------------------------------------------------------------- |
| Language         | TypeScript 6.0+ with strict checking and ESM                                      |
| Build            | Nx and pnpm, pinned in [package.json](package.json)                               |
| Frameworks       | Angular 22+, React 19+, and Vue 3.5+                                              |
| Reactive runtime | RxJS 7.8+                                                                         |
| Storage          | wa-sqlite, sqlite-wasm, PGlite, Supabase, HTTP, and sqliteai                      |
| Testing          | Vitest for unit and integration tests, Playwright for E2E and accessibility tests |
| Hosts            | Browser, Node.js 26+, Electron, and Tauri                                         |

> [!NOTE]
> The API is still evolving. Pin versions before production use and follow the [migration guide](https://rxdb.aiao.io/en/docs/migration/). The status overview tracks progress ([96/139 delivered](requirements/status-overview.md)).

Support and feedback are welcome. Use the [bug report](https://github.com/aiao-io/rxdb/issues/new?template=bug_report.yml), [feature request](https://github.com/aiao-io/rxdb/issues/new?template=feature_request.yml), or [question form](https://github.com/aiao-io/rxdb/issues/new?template=question.yml).

## Install

The published core packages can be installed with pnpm.

```sh
pnpm add @aiao/rxdb
```

Choose the framework binding and storage adapter required by your application.

```sh
pnpm add @aiao/rxdb-react @aiao/rxdb-adapter-pglite
```

The Admin, I18n, Board, and P2P packages currently require this repository workspace. Use the corresponding workspace example until those packages are published.

## Minimal model example

```ts
import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';

@Entity({
  name: 'Todo',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'completed', type: PropertyType.boolean, default: false }
  ]
})
export class Todo extends EntityBase {
  declare title: string;
  declare completed: boolean;
}

const database = new RxDB({
  dbName: 'todo-demo',
  entities: [Todo],
  context: { userId: 'demo' },
  sync: { type: SyncType.None, local: { adapter: 'pglite' } }
});
```

The [Getting Started documentation](https://rxdb.aiao.io/en/docs/getting-started/) contains the complete setup for adapters, repositories, and framework bindings.

## Workspace development

This repository uses Nx and pnpm. Install Node.js 26 or newer and the pnpm version declared in the root `package.json`.

```sh
pnpm install

pnpm nx serve dev-rxdb-angular
pnpm nx serve dev-rxdb-react
pnpm nx serve dev-rxdb-vue
```

Other useful examples include the Admin templates, the Board demo, the P2P demo, the HTTP and Supabase demos, the Electron and Tauri hosts, and the DevTools extension.

```sh
pnpm nx serve rxdb-admin-template-angular
pnpm nx serve rxdb-admin-template-react
pnpm nx serve rxdb-admin-template-vue
pnpm nx serve website
```

Run a focused test while developing and the full repository gate before opening a pull request.

```sh
pnpm nx test rxdb --watch
pnpm nx run rxdb:typecheck
pnpm nx run rxdb:lint
pnpm test-all
```

The [contribution guide](CONTRIBUTING.md) explains TDD, framework symmetry, Nx targets, coverage requirements, and pull request conventions.

## Repository layout

| Path                                | Purpose                                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| `packages/rxdb`                     | Core entities, repositories, queries, storage contracts, and synchronization primitives |
| `packages/rxdb-model`               | Model metadata, generated labels, and model-driven UI contracts                         |
| `packages/rxdb-{angular,react,vue}` | Framework bindings                                                                      |
| `packages/rxdb-adapter-*`           | Storage and synchronization adapters                                                    |
| `packages/rxdb-plugin-*`            | Optional plugins for search, history, tree, board, sync, and other capabilities         |
| `packages/rxdb-admin*`              | Framework-agnostic Admin shell and framework bindings                                   |
| `packages/rxdb-i18n*`               | Runtime internationalization and framework bindings                                     |
| `apps/dev-rxdb-*`                   | Framework and host demonstrations                                                       |
| `website`                           | Docusaurus documentation site                                                           |
| `requirements`                      | Stories, epics, plans, acceptance records, and delivery governance                      |

## Project status and roadmap

The project is working toward a stable 1.0 release. Current work focuses on public API gates, migration safety, coverage, cross-framework symmetry, local-first collaboration, model-driven applications, adapters, search, and developer tooling.

- [Status overview](requirements/status-overview.md)
- [Roadmap](requirements/roadmap.md)
- [Release plan](requirements/release-plan.md)
- [Compatibility matrix](https://rxdb.aiao.io/en/docs/compatibility)
- [English support plan](requirements/english-support-plan.md)

## 实际应用

[Aiao Media](aiao-media/apps/web/README.md) 是同仓孵化的 local-first 图片创作应用，包含独立产品需求、部署和浏览器验收。启动：`pnpm nx run aiao-media:serve`。

## Contributing

Pull requests are welcome. Please read the [contribution guide](CONTRIBUTING.md) before changing code. Chinese readers can use the [简体中文贡献指南](CONTRIBUTING.zh-CN.md).

- Follow TDD and add regression tests for behavior changes.
- Keep Angular, React, and Vue functionality and public APIs symmetric.
- Use strict TypeScript, avoid `any`, and keep lint output clean.
- Run Nx tasks through `pnpm nx`.
- Keep changes to public packages and their framework consumers in one reviewable scope.
- Include TSDoc for new public exports.

## License

This project is licensed under the [MIT License](LICENSE).
