# omitBy()

## Call Signature

```ts
function omitBy<T, K>(object, predicate): Omit<T, K>;
```

Defined in: [packages/utils/src/object/omitBy.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/object/omitBy.ts#L10)

Creates a new object excluding properties that satisfy a predicate (key-type predicate overload)

When `predicate` is written as `(value, key): key is K`, the return type is precisely `Omit<T, K>`.

### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* `object` |
| <a id="type-parameter-k"></a> `K` *extends* `string` |

### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `object` | `T` | Source object |
| `predicate` | (`value`, `key`) => `key is K` | Type predicate narrowing "the keys to exclude" |

### Returns

`Omit`&lt;`T`, `K`&gt;

A new object without `K`

## Call Signature

```ts
function omitBy<T>(object, predicate): Partial<T>;
```

Defined in: [packages/utils/src/object/omitBy.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/object/omitBy.ts#L25)

Creates a new object excluding properties that satisfy a predicate

Returns `Partial<T>` rather than `T`: any key could be excluded by `predicate`, and declaring `T` would let accesses like `result.a.toFixed()` compile under strict mode while reading `undefined` at runtime (UTL-006). Use the type-predicate overload above when a precise type is needed.

### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-1"></a> `T` *extends* `object` |

### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `object` | `T` | Source object |
| `predicate` | (`value`, `key`) => `boolean` | Excludes the property when it returns true |

### Returns

`Partial`&lt;`T`&gt;

A new object
