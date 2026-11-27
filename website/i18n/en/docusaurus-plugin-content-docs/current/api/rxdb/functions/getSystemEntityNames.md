# getSystemEntityNames()

```ts
function getSystemEntityNames(): ReadonlySet<string>;
```

Defined in: [packages/rxdb/src/system/system-entities.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/system-entities.ts#L103)

The entity names of all system tables (the `name` on `@Entity`, without namespace).

## Returns

`ReadonlySet`&lt;`string`&gt;

The set of names computed from the current registry; **re-evaluated on every call**

## Remarks

It must be computed on the spot, not hoisted into a module-level constant. The cost of hoisting is not a compile error: tables registered by plugins would silently leak into business entities,
and the library's own bookkeeping writes would start landing in the working tree as user edits — with no test ever turning red for it.
