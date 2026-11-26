# rxDBPluginTree

```ts
const rxDBPluginTree: Plugin<RxDBPluginTreeOptions>;
```

Defined in: [rxdb-plugin-tree/src/plugin.ts:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/plugin.ts#L111)

Factory of [RxDBPluginTree](../classes/RxDBPluginTree.md), passed to `RxDB.use()`.

## Remarks

Applications registering tree entities (extending `TreeAdjacencyListEntityBase` or annotated with `@TreeEntity`) **must** install it: without it, `repository: 'TreeRepository'` finds no repository at registration time and entity initialization throws immediately (the contract lives in `__tests__/contracts/missing-plugin-error.spec.ts`) — it never silently degrades to a plain repository.

## Param

**db**

The host `RxDB` instance, injected by `use()`

## Returns

The plugin instance

## Example

```typescript
const rxdb = new RxDB({ entities: [Category] }).use(rxDBPluginTree);
```
