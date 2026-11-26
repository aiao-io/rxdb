# provideRxDB()

```ts
function provideRxDB(source): EnvironmentProviders;
```

Defined in: [rxdb-angular/src/rxdb.provider.ts:128](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/rxdb.provider.ts#L128)

Configures the RxDB instance used by the Angular injector.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `source` | [`RxDBSource`](../type-aliases/RxDBSource.md) | Database instance, a Promise, or a factory returning either |

## Returns

`EnvironmentProviders`

Angular environment providers

## Remarks

After a synchronous source (an instance, or a factory returning an instance) resolves, `inject(RxDB)` is available immediately, unchanged from before. An asynchronous source is awaited **before bootstrap** by the `provideAppInitializer` registered together with this function, so `inject(RxDB)` under the root injector remains synchronous — callers do not need to write their own initializer.

Note that `provideAppInitializer` only takes effect in the **root** environment injector. When this function is used in route-level providers, nobody awaits the asynchronous source for you, and `inject(RxDB)` throws NOT\_READY\_MESSAGE; in that scenario use [useRxDBOptional](useRxDBOptional.md) and handle loading yourself.

For the lifecycle, see the "ownership rule" of createHolder.

## Example

```typescript
// Synchronous factory (most common)
provideRxDB(setup_rxdb)

// Dynamic import: the desktop branch stays out of the web bundle
provideRxDB(async () => (await import('./setup_rxdb_desktop')).default())
```
