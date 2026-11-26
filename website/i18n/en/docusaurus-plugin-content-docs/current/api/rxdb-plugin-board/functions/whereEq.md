# whereEq()

```ts
function whereEq<F, V>(field, value): object;
```

Defined in: [packages/rxdb-plugin-board/src/query.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/query.ts#L48)

`field = value` rule group.

## Type Parameters

| Type Parameter                                       |
| ---------------------------------------------------- |
| <a id="type-parameter-f"></a> `F` _extends_ `string` |
| <a id="type-parameter-v"></a> `V` _extends_ `string` |

## Parameters

| Parameter | Type |
| --------- | ---- |
| `field`   | `F`  |
| `value`   | `V`  |

## Returns

`object`

### combinator

```ts
combinator: 'and';
```

### rules

```ts
rules: object[];
```
