# inRule()

```ts
function inRule<F, V>(field, values): object;
```

Defined in: [packages/rxdb-plugin-board/src/query.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/query.ts#L23)

`field IN [...]` rule.

## Type Parameters

| Type Parameter                                       |
| ---------------------------------------------------- |
| <a id="type-parameter-f"></a> `F` _extends_ `string` |
| <a id="type-parameter-v"></a> `V` _extends_ `string` |

## Parameters

| Parameter | Type           |
| --------- | -------------- |
| `field`   | `F`            |
| `values`  | readonly `V`[] |

## Returns

`object`

### field

```ts
field: F;
```

### operator

```ts
operator: 'in';
```

### value

```ts
value: V[];
```
