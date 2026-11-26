# assertDesktopHostResponse()

```ts
function assertDesktopHostResponse<TKind>(
  expected,
  value
):
  | Extract<
      {
        kind: 'handshake';
        result: DesktopHostHandshakeResult;
      },
      {
        kind: TKind;
      }
    >
  | Extract<
      {
        kind: 'open';
        result: DesktopHostOpenResult;
      },
      {
        kind: TKind;
      }
    >
  | Extract<
      {
        kind: 'execute';
        result: SqliteSuccessResult;
      },
      {
        kind: TKind;
      }
    >
  | Extract<
      {
        kind: 'version';
        result: string;
      },
      {
        kind: TKind;
      }
    >
  | Extract<
      {
        kind: 'close';
      },
      {
        kind: TKind;
      }
    >
  | Extract<
      {
        kind: 'mute';
      },
      {
        kind: TKind;
      }
    >
  | Extract<
      {
        kind: 'drop';
        result: DesktopHostDropResult;
      },
      {
        kind: TKind;
      }
    >
  | Extract<
      {
        code: RxDBAdapterDesktopErrorCode;
        kind: 'error';
        message: string;
      },
      {
        kind: TKind;
      }
    >;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:451

Validates a host response and converts error responses back into local exceptions.

## Type Parameters

| Type Parameter                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------ |
| <a id="type-parameter-tkind"></a> `TKind` _extends_ `"open"` \| `"handshake"` \| `"execute"` \| `"version"` \| `"close"` \| `"mute"` \| `"drop"` |

## Parameters

| Parameter  | Type      | Description                                  |
| ---------- | --------- | -------------------------------------------- |
| `expected` | `TKind`   | The expected response type                   |
| `value`    | `unknown` | The unvalidated payload returned by the host |

## Returns

\| `Extract`&lt;\{
`kind`: `"handshake"`;
`result`: [`DesktopHostHandshakeResult`](../interfaces/DesktopHostHandshakeResult.md);
\}, \{
`kind`: `TKind`;
\}&gt;
\| `Extract`&lt;\{
`kind`: `"open"`;
`result`: [`DesktopHostOpenResult`](../interfaces/DesktopHostOpenResult.md);
\}, \{
`kind`: `TKind`;
\}&gt;
\| `Extract`&lt;\{
`kind`: `"execute"`;
`result`: [`SqliteSuccessResult`](../../rxdb-adapter-sqlite-core/interfaces/SqliteSuccessResult.md);
\}, \{
`kind`: `TKind`;
\}&gt;
\| `Extract`&lt;\{
`kind`: `"version"`;
`result`: `string`;
\}, \{
`kind`: `TKind`;
\}&gt;
\| `Extract`&lt;\{
`kind`: `"close"`;
\}, \{
`kind`: `TKind`;
\}&gt;
\| `Extract`&lt;\{
`kind`: `"mute"`;
\}, \{
`kind`: `TKind`;
\}&gt;
\| `Extract`&lt;\{
`kind`: `"drop"`;
`result`: `DesktopHostDropResult`;
\}, \{
`kind`: `TKind`;
\}&gt;
\| `Extract`&lt;\{
`code`: [`RxDBAdapterDesktopErrorCode`](../type-aliases/RxDBAdapterDesktopErrorCode.md);
`kind`: `"error"`;
`message`: `string`;
\}, \{
`kind`: `TKind`;
\}&gt;

The response corresponding to `expected`

## Remarks

This is the unwrapping point paired with [DesktopHostResponse](../type-aliases/DesktopHostResponse.md): error responses are turned
back into [RxDBAdapterDesktopError](../classes/RxDBAdapterDesktopError.md) and thrown here, so callers still write ordinary `try/catch`
and never feel the IPC in between. Error codes are first screened by isRxDBAdapterDesktopErrorCode;
strings outside the contract are always treated as protocol violations.

## Throws

[RxDBAdapterDesktopError](../classes/RxDBAdapterDesktopError.md) throws with the host's original error code when the host reports an error; throws `protocol_violation` when the response shape does not match
