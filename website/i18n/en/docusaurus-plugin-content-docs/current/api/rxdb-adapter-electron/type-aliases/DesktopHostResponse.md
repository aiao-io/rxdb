# DesktopHostResponse

```ts
type DesktopHostResponse =
  | {
      kind: 'handshake';
      result: DesktopHostHandshakeResult;
    }
  | {
      kind: 'open';
      result: DesktopHostOpenResult;
    }
  | {
      kind: 'execute';
      result: SqliteResult;
    }
  | {
      kind: 'version';
      result: string;
    }
  | {
      kind: 'close';
    }
  | {
      kind: 'mute';
    }
  | {
      kind: 'drop';
      result: DesktopHostDropResult;
    }
  | {
      code: RxDBAdapterDesktopErrorCode;
      kind: 'error';
      message: string;
    };
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:208

The host's response to a request.

## Remarks

Failures also travel through **normal return values** rather than rejection: Electron's `ipcRenderer.invoke` only serializes errors into strings on rejection, and custom `Error` subclasses with their `code` fields are all lost. Putting the error code in the return value is what lets AC#4's promise of "stable, discernible error codes" actually cross the process boundary and reach the caller alive.
