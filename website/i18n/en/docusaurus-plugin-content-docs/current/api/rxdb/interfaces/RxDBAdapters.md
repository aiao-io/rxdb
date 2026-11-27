# RxDBAdapters

Defined in: [packages/rxdb/src/rxdb-adapter.ts:1164](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L1164)

Type registry of registered adapters.

## Remarks

This interface is **intentionally empty**: each adapter package merges its own name and implementation class in
via `declare module '@aiao/rxdb'` (the `rxdb-adapter-sqlite` / `-sqlite-wasm` / `-wa-sqlite` / `-pglite` /
`-sqliteai` five packages all do this).

It used to carry the `[name: string]: IRxDBAdapter` index signature, which made `keyof RxDBAdapters` always
`string` and `RxDBAdapters[K]` always `IRxDBAdapter` — so those five `declare module` merges **none took
effect**, and `getAdapter('sqlite')` could only ever get the base interface. The index signature has been
removed; the "name may be any string" concern is now carried by [RxDBAdapterName](../type-aliases/RxDBAdapterName.md)
and `getAdapter`'s loose overload.

## Example

```ts
declare module '@aiao/rxdb' {
  interface RxDBAdapters {
    sqlite: RxDBAdapterSqlite;
  }
}
```
