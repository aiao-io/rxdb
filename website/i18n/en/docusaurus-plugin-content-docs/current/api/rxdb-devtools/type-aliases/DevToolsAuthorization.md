# DevToolsAuthorization

```ts
type DevToolsAuthorization = 
  | {
  outcome: "allowed";
}
  | {
  outcome: "silent-drop";
}
  | {
  error: DevToolsErrorPayload;
  outcome: "rejected";
};
```

Defined in: [v2/authorization.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/authorization.ts#L125)

Authorization verdict.

## Remarks

The distinction between `silent-drop` and `rejected` is load-bearing: the former must produce no outbound frames, no provider calls,
and no resource allocation; the latter must send back a structured error.
