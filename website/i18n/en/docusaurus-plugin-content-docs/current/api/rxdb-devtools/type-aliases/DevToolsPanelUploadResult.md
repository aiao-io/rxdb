# DevToolsPanelUploadResult

```ts
type DevToolsPanelUploadResult = 
  | {
  outcome: "sent";
}
  | {
  error: DevToolsErrorPayload;
  outcome: "failed";
};
```

Defined in: [v2/panel-endpoint.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L73)

Result of a single upload.

## Remarks

`'sent'` means exactly what it says and nothing more: all bytes were sent per the protocol, the upload request got the provider's
`RESPONSE`, and no `ERROR` for this upload was received before that. It is **not** "the provider committed".
See item 2 in the module header for the rationale.
