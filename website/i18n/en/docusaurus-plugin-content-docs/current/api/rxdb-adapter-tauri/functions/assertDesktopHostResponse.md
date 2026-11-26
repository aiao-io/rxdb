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

Validates a host response and turns error responses back into local exceptions.

## Type Parameters

| Type Parameter                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------ |
| <a id="type-parameter-tkind"></a> `TKind` _extends_ `"handshake"` \| `"open"` \| `"execute"` \| `"version"` \| `"close"` \| `"mute"` \| `"drop"` |

## Parameters

| Parameter  | Type      | Description                              |
| ---------- | --------- | ---------------------------------------- |
| `expected` | `TKind`   | The expected response kind               |
| `value`    | `unknown` | Unvalidated payload returned by the host |

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

The response matching `expected`

## Remarks

This is the unwrapping point paired with [DesktopHostResponse](../type-aliases/DesktopHostResponse.md): error responses turn back
into thrown [RxDBAdapterDesktopError](../classes/RxDBAdapterDesktopError.md) here, so callers still write ordinary `try/catch` and
never feel the IPC in between. Error codes pass through isRxDBAdapterDesktopErrorCode first; strings
outside the contract are always treated as protocol violations.

## Throws

[RxDBAdapterDesktopError](../classes/RxDBAdapterDesktopError.md) rethrown with its original error code when the host reports an error; throws `protocol_violation` when the response shape does not match
