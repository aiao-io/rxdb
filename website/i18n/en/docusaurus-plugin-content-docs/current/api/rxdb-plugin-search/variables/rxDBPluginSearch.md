# rxDBPluginSearch

```ts
const rxDBPluginSearch: Plugin<SearchPluginOptions>;
```

Defined in: [packages/rxdb-plugin-search/src/plugin.ts:904](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/plugin.ts#L904)

Plugin factory; same shape as `rxDBPluginTrigger`.

## Example

```ts
db.use(rxDBPluginSearch, { debounce: 200 });
await db.connect('sqlite-wasm');
await db.searchPlugin.ready;
const handle = db.search('foo bar');
```
