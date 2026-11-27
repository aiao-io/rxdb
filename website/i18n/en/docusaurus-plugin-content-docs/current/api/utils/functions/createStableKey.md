# createStableKey()

```ts
function createStableKey(value, label?): string;
```

Defined in: [packages/utils/src/object/createStableKey.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/object/createStableKey.ts#L76)

Turns any serializable value into a stable string key for "has the content changed" checks.

## Parameters

| Parameter | Type      | Default value | Description                                                                                           |
| --------- | --------- | ------------- | ----------------------------------------------------------------------------------------------------- |
| `value`   | `unknown` | `undefined`   | The value to serialize                                                                                |
| `label?`  | `string`  | `'Value'`     | Error message prefix, letting the caller's error carry business context (e.g. `'RxDB query options'`) |

## Returns

`string`

A stable key that corresponds one-to-one with the content; object key order, Map key order, and Set member order do not affect the result

## Throws

Thrown when the value contains functions, symbols, unrecognized host objects, or circular references

## Remarks

Shared by the three framework binding packages to avoid per-framework drift: the naive `JSON.stringify` + `Object.keys` approach collapses `Date`/`Map`/`Set`/`RegExp` all into `{}`, so changed options can produce the same key — surfacing as "the list does not refresh after changing the filter" with no error at all.

## Example

```ts
createStableKey({ b: 1, a: 2 }) === createStableKey({ a: 2, b: 1 }); // true
createStableKey(new Date('2026-01-01')) !== createStableKey(new Date('2026-07-01')); // true
```
