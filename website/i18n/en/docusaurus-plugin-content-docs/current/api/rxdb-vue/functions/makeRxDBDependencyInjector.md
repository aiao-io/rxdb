# makeRxDBDependencyInjector()

```ts
function makeRxDBDependencyInjector<T>(): RxDBDependencyInjection<T>;
```

Defined in: [rxdb-vue/src/rxdb-vue.ts:182](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/rxdb-vue.ts#L182)

Creates a set of type-safe RxDB Vue dependency injection functions.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`RxDB`](../../rxdb/classes/RxDB.md) |

## Returns

[`RxDBDependencyInjection`](../interfaces/RxDBDependencyInjection.md)&lt;`T`&gt;

RxDB provider plus synchronous and reactive injectors.

## Remarks

Each call generates an independent injection key, so multiple calls yield **mutually isolated** provider/injector sets (aligned with React's `makeRxDBProvider` creating a fresh context per call). If the key is hoisted to module top level, two injector sets read and write the same Symbol, the database provided later overwrites the earlier one, and the generic `T` is merely a fake compile-time assertion — you may get a database injected by the other set.
