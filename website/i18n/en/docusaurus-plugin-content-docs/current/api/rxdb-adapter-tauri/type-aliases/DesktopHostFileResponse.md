# DesktopHostFileResponse

```ts
type DesktopHostFileResponse =
  | {
      kind: 'file.open';
      result: {
        protocolVersion: number;
        sessionId: string;
      };
    }
  | {
      kind: 'file.close';
    }
  | {
      kind: 'file.stat';
      result: DesktopHostFileStat | null;
    }
  | {
      kind: 'file.list';
      result: readonly DesktopHostFileEntry[];
    }
  | {
      kind: 'file.mkdir';
    }
  | {
      kind: 'file.rmdir';
    }
  | {
      kind: 'file.remove';
    }
  | {
      kind: 'file.move';
    }
  | {
      kind: 'file.read';
      result: DesktopHostFileReadResult;
    }
  | {
      kind: 'file.writeBegin';
      result: {
        writeId: string;
      };
    }
  | {
      kind: 'file.writeChunk';
    }
  | {
      kind: 'file.writeCommit';
    }
  | {
      kind: 'file.writeAbort';
    }
  | {
      kind: 'file.lockAcquire';
      result: {
        lockId: string;
      };
    }
  | {
      kind: 'file.lockRelease';
    }
  | {
      code: RxDBAdapterDesktopErrorCode;
      kind: 'error';
      message: string;
    };
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:338

The host's response to one file request; failures also go through the normal return value.
