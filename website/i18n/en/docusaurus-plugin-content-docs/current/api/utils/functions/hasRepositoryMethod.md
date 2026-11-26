# hasRepositoryMethod()

```ts
function hasRepositoryMethod(obj, methodName): boolean;
```

Defined in: [packages/utils/src/types/repository-query.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/types/repository-query.ts#L79)

Checks whether an object has the specified query method

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `obj` | `unknown` | The object to check |
| `methodName` | `string` | The method name |

## Returns

`boolean`

Returns true if the object has the method

## Example

```typescript
if (hasRepositoryMethod(User, 'find')) {
  // User has the find method
}
```
