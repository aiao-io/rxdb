# DevToolsProviderResult

```ts
type DevToolsProviderResult = 
  | {
  outcome: "ok";
  result: unknown;
}
  | {
  error: DevToolsErrorPayload;
  outcome: "failed";
};
```

Defined in: [provider/types.ts:167](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/types.ts#L167)

Result of a single provider call.

## Remarks

The failure branch carries an **already mapped, already redacted** error; raw platform exceptions must never reach this point.
