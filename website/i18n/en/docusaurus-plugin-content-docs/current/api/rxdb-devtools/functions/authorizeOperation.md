# authorizeOperation()

```ts
function authorizeOperation(input): DevToolsAuthorization;
```

Defined in: [v2/authorization.ts:172](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/authorization.ts#L172)

Applies the three-layer authorization to an operation request.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | [`DevToolsAuthorizationInput`](../interfaces/DevToolsAuthorizationInput.md) | The local configuration and the requested domain and operation. |

## Returns

[`DevToolsAuthorization`](../type-aliases/DevToolsAuthorization.md)

One of the three conclusions.

## Remarks

The check order is fixed as capability → descriptor → mutationPolicy, and **unregistered operations are handled with the strictest treatment** (silently dropped): the type system cannot stop arbitrary strings on the wire, and defaulting to allow is the worst possible default here.
