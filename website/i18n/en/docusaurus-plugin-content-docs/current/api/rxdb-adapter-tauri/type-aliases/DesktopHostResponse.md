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

The host's response to one request.

## Remarks

Failures also go through the **normal return value** rather than rejection: Electron's
`ipcRenderer.invoke` only serializes errors into strings on rejection, losing custom `Error`
subclasses and their `code` field entirely. Putting the error code into the return value is how
AC#4's promised "stable, distinguishable error codes" actually survive the process boundary and
reach the caller.
