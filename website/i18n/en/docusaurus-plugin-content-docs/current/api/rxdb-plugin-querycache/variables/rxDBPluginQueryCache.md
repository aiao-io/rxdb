# rxDBPluginQueryCache

```ts
const rxDBPluginQueryCache: Plugin<RxDBPluginQueryCacheOptions>;
```

Defined in: [rxdb-plugin-querycache/src/plugin.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-querycache/src/plugin.ts#L50)

QueryCache read engine plugin factory.

## Param

**db**

Host instance

## Example

```ts
import { rxDBPluginQueryCache } from '@aiao/rxdb-plugin-querycache';

rxdb.use(rxDBPluginQueryCache);
```
