# get()

```ts
function get<T>(
   obj, 
   path, 
   defaultValue?
): T;
```

Defined in: [packages/utils/src/object/get.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/object/get.ts#L35)

Safely reads a nested path separated by dots, brackets, or commas

Parsing order: first the whole `path` is treated as a **literal key** (split only on `,[]`, with dots kept in the key name); on a hit it returns directly. Only on a miss does it fall back to a **nested path** (split on `,[].`). Hence `get({ 'a.b': 1, a: { b: 2 } }, 'a.b')` yields `1`.

Hits are decided segment by segment with `in`, independent of the value itself: `0`, `false`, `''`, `NaN`, and self-references equal to the root object all count as hits. Only when **the value read is `undefined`** or the path breaks (missing segment / `null` in the middle) is `defaultValue` returned.

## Type Parameters

| Type Parameter | Default type | Description |
| ------ | ------ | ------ |
| <a id="type-parameter-t"></a> `T` | `unknown` | The return type the caller expects |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `obj` | `unknown` | The value to query |
| `path` | `string` | Property path |
| `defaultValue?` | `T` | Default value when the path does not exist |

## Returns

`T`

The value at the path, or the default value

## Example

```ts
get({ a: [{ b: { c: 1 } }] }, 'a[0].b.c'); // 1
get({ 'a.b': 0 }, 'a.b', 'D'); // 0
get({ a: null }, 'a.b', 'D'); // 'D'
```
