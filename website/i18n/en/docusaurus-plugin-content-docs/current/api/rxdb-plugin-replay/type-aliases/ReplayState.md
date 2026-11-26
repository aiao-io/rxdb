# ReplayState

```ts
type ReplayState =
  | {
      kind: 'idle';
    }
  | {
      kind: 'recording';
      sessionId: string;
    }
  | {
      code: ReplayTruncatedCode;
      kind: 'truncated';
      sessionId: string;
    }
  | {
      error: Error;
      kind: 'error';
      sessionId: string | null;
    };
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L35)

Value of `rxdb.replay.state$`.

## Remarks

Initially `idle`; no values are emitted after the scope is released (the stream completes). See `git show 2e820521:specs/005-us-909-session-replay/data-model.md` §3.2 for the transition table.
