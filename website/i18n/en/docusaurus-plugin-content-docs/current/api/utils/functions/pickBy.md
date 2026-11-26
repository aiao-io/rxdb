# pickBy()

## Call Signature

```ts
function pickBy<T, K>(object, predicate): Pick<T, K>;
```

Defined in: [packages/utils/src/object/pickBy.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/object/pickBy.ts#L10)

Creates a new object keeping only the properties that satisfy the predicate (key type-predicate overload)

When `predicate` is written as `(value, key): key is K`, the return type is precise to `Pick<T, K>`.

### Type Parameters

| Type Parameter                                       |
| ---------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ `object` |
| <a id="type-parameter-k"></a> `K` _extends_ `string` |

### Parameters

| Parameter   | Type                           | Description                             |
| ----------- | ------------------------------ | --------------------------------------- |
| `object`    | `T`                            | The source object                       |
| `predicate` | (`value`, `key`) => `key is K` | The type predicate that narrows the key |

### Returns

`Pick`&lt;`T`, `K`&gt;

A new object containing only `K`

## Call Signature

```ts
function pickBy<T>(object, predicate): Partial<T>;
```

Defined in: [packages/utils/src/object/pickBy.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/object/pickBy.ts#L25)

Creates a new object keeping only the properties that satisfy the predicate

Returns `Partial<T>` rather than `T`: any key may be filtered out by `predicate`, and declaring `T` would let accesses like `result.b.toFixed()` compile under strict mode while reading `undefined` at runtime (UTL-006). Use the type-predicate overload above when a precise type is needed.

### Type Parameters

| Type Parameter                                         |
| ------------------------------------------------------ |
| <a id="type-parameter-t-1"></a> `T` _extends_ `object` |

### Parameters

| Parameter   | Type                          | Description                                 |
| ----------- | ----------------------------- | ------------------------------------------- |
| `object`    | `T`                           | The source object                           |
| `predicate` | (`value`, `key`) => `boolean` | The property is kept when this returns true |

### Returns

`Partial`&lt;`T`&gt;

The new object
