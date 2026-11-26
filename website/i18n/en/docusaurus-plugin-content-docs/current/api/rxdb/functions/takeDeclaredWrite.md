# takeDeclaredWrite()

```ts
function takeDeclaredWrite(scope): 
  | ResolvedTrustedWrite
  | undefined;
```

Defined in: [packages/rxdb/src/trusted-write/trusted-write-scope.ts:115](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-scope.ts#L115)

Takes out and clears the declaration on this scope

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `scope` | `object` | The same scope object used at declaration time |

## Returns

  \| [`ResolvedTrustedWrite`](../interfaces/ResolvedTrustedWrite.md)
  \| `undefined`

The declaration of the resolved entrance; `undefined` when there is no declaration
