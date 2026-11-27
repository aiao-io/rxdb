# DevToolsPanelDownloadResult

```ts
type DevToolsPanelDownloadResult =
  | {
      outcome: 'received';
      result: unknown;
    }
  | {
      outcome: 'delivered-at-source';
      result: unknown;
    }
  | {
      error: DevToolsErrorPayload;
      outcome: 'failed';
    };
```

Defined in: [v2/panel-endpoint.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L103)

Result of a single download.

## Remarks

Three branches, because "where the bytes went" has three truthful answers and merging any two would lie:

- `'received'` — the bytes really traveled the wire through the `TRANSFER_*` state machine and were `commit`ed into the caller-provided sink.
- `'delivered-at-source'` — the connector explicitly says this download was delivered **at the source side** (browser OPFS
  goes through the page's own save path, the bytes never touch the wire), and the sink received nothing. It is a success, but folding it into
  `'received'` would make the UI read an empty sink.
- `'failed'` — carries the mapped error.
