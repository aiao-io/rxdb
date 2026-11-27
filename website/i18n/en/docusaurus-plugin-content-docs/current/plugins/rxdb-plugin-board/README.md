# Single-player task board

`@aiao/rxdb-plugin-board` provides the board domain model and services; the Angular, React, and Vue bindings provide views and an application shell. The current scope is single-player, local-first task management: multiple boards and columns, task details, labels, due dates, filtering, drag and drop, keyboard navigation, history, and backup restore.

## Packages and entry points

| Package                           | Main entry points                                                                             |
| :-------------------------------- | :-------------------------------------------------------------------------------------------- |
| `@aiao/rxdb-plugin-board`         | `Board`, `Column`, `Task`, `BoardLabel`, `TaskLabel`, domain services, `BoardShellController` |
| `@aiao/rxdb-plugin-board-angular` | `BoardViewComponent`, `BoardShellComponent`, `useBoard`                                       |
| `@aiao/rxdb-plugin-board-react`   | `BoardView`, `BoardShell`, `useBoard`                                                         |
| `@aiao/rxdb-plugin-board-vue`     | `BoardView`, `BoardShell`, `useBoard`                                                         |

This package family is not yet part of the npm release set; verify it from the repository workspace first. The package names and code examples describe the current `main` integration — do not treat the workspace version `0.0.28` as proof that these packages are published. For local run entry points, see [Capabilities and examples](/getting-started/capabilities.md).

A full view requires loading the corresponding binding's `board-view.css` subpath import. React / Vue import it at the application entry; Angular configures it in global styles. When you only use the data and actions from `useBoard`, no view styles are needed.

## Prepare the database

Add the five entities to the same RxDB. Install the history and search plugins and register the local adapter before connecting. The first supported combination for the full `BoardShell` is **sqlite-wasm on the main thread with `vfs: 'idb'`**; the instance factory returns an unconnected database and the shell assigns the database name:

```ts
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { Board, BoardLabel, Column, Task, TaskLabel } from '@aiao/rxdb-plugin-board';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';

export function createRxdb(dbName: string): RxDB {
  const db = new RxDB({
    dbName,
    entities: [Board, Column, Task, BoardLabel, TaskLabel],
    sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
  });
  db.use(rxDBPluginHistory);
  db.use(rxDBPluginSearch);
  db.adapter(
    'sqlite-wasm',
    () =>
      new RxDBAdapterSqlite(db, {
        vfs: 'idb',
        wasmUrl: '/sqlite-wasm/wa-sqlite-async.wasm'
      })
  );
  return db;
}
```

The WASM comes from the adapter's dependency `@subframe7536/sqlite-wasm`; see the [sqlite-wasm adapter](/adapters/sqlite-wasm.md) for how to copy it. Do not put the wa-sqlite or official SQLite WASM at that path.

## Shells for all three frameworks

React example. Keep `options` as a stable reference outside the component:

```tsx
import type { BoardShellOptions } from '@aiao/rxdb-plugin-board';
import { BoardShell } from '@aiao/rxdb-plugin-board-react';
import '@aiao/rxdb-plugin-board-react/board-view.css';
import { createRxdb } from './board-rxdb';

const options: BoardShellOptions = { createRxdb, adapterName: 'sqlite-wasm' };

export function BoardPage() {
  return <BoardShell options={options} />;
}
```

Angular uses `<board-shell [options]="options" />` with `BoardShellComponent`; Vue uses `<BoardShell :options="options" />`. All three frameworks share the `BoardShellController` startup, recovery, and database-switching flows; an optional `seed` provides demo data.

The shell first shows a create-or-recover entry and does not connect the database until the user chooses. Recovery writes under a new database name and switches the active database only after a full page reload reads it back successfully; it never overwrites the currently connected database. When you only need to embed a board, `BoardView` / `BoardViewComponent` receive the board instance your application already connected.

## Search, history, and a runnable example

The board maintains ownership, manual ordering, and operation permissions through entity repositories and domain services. Search uses the [search plugin](/plugins/rxdb-plugin-search/README.md) and history uses the [history plugin](/plugins/rxdb-plugin-history/README.md); do not infer from this that every database adapter supports the full board shell.

```bash
pnpm nx serve dev-rxdb-board
```

The standalone example lives in `apps/dev-rxdb-board`. The combined three-framework demos also include a board page, making it easy to compare binding implementations. Multi-player real-time collaboration and P2P file sharing are outside the default scope of the single-player board.
