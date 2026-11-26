# DevToolsPanelRequestResult

```ts
type DevToolsPanelRequestResult = 
  | {
  outcome: "ok";
  result: unknown;
}
  | {
  error: DevToolsErrorPayload;
  outcome: "failed";
};
```

Defined in: [v2/panel-endpoint.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L61)

Result of a single request; **never rejects** — errors are values, callers need no try/catch.
