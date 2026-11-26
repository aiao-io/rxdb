# assertOo1Static()

```ts
function assertOo1Static(value): asserts value is Oo1Static;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/oo1-types.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/oo1-types.ts#L103)

Asserts that a third-party sqlite-wasm init result satisfies the minimal runtime contract of the shared oo1 client.

## Parameters

| Parameter | Type      | Description                                             |
| --------- | --------- | ------------------------------------------------------- |
| `value`   | `unknown` | Unknown value returned by the sqlite-wasm init function |

## Returns

`asserts value is Oo1Static`

## Throws

Throws `TypeError` when the return value lacks the database constructor, update hook, or version information
