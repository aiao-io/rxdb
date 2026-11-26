# getRepositoryMethod()

```ts
function getRepositoryMethod<TResult>(EntityType, methodName): QueryMethod<TResult> | undefined;
```

Defined in: [packages/utils/src/types/repository-query.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/types/repository-query.ts#L44)

Safely gets a query method from an EntityType

## Type Parameters

| Type Parameter                                |
| --------------------------------------------- |
| <a id="type-parameter-tresult"></a> `TResult` |

## Parameters

| Parameter    | Type      | Description                                       |
| ------------ | --------- | ------------------------------------------------- |
| `EntityType` | `unknown` | The entity type constructor                       |
| `methodName` | `string`  | Method name (e.g. 'find', 'findOne', 'get', etc.) |

## Returns

\| [`QueryMethod`](../interfaces/QueryMethod.md)&lt;`TResult`&gt;
\| `undefined`

The query method, or undefined (if the method does not exist)

## Example

```typescript
const queryMethod = getRepositoryMethod<User[]>(User, 'find');
if (!queryMethod) {
  throw new Error('Method "find" not found on User');
}
const observable = queryMethod({ where: { age: { $gt: 18 } } });
```

## Remarks

This function provides type-safe method access without `any` or type assertions.
It checks that the method exists and is a function, then returns it bound to EntityType.
