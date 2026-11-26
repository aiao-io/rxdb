# eq()

```ts
function eq<F, V>(field, value): object;
```

Defined in: [packages/rxdb-plugin-board/src/query.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/query.ts#L16)

`field = value` rule (generics narrow the field and value types).
Values only accept strings: the fields filtered by column on boards are all UUID / text; relax this when callers query numeric, boolean or date columns.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-f"></a> `F` *extends* `string` |
| <a id="type-parameter-v"></a> `V` *extends* `string` |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `field` | `F` |
| `value` | `V` |

## Returns

`object`

### field

```ts
field: F;
```

### operator

```ts
operator: "=";
```

### value

```ts
value: V;
```
