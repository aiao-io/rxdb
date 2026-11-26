# rxDBPluginSync

```ts
const rxDBPluginSync: Plugin<RxDBPluginSyncOptions>;
```

Defined in: [packages/rxdb-plugin-sync/src/plugin.ts:132](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/plugin.ts#L132)

The sync plugin factory.

## Param

**db**

The host instance

## Example

```ts
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';

// The order doesn't matter: the host topologically sorts by `inject`, so the history plugin always installs first.
rxdb.use(rxDBPluginSync);
rxdb.use(rxDBPluginHistory);
```
