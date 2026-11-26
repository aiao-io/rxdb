# DevToolsCapability

```ts
type DevToolsCapability = "none" | "readonly" | "full";
```

Defined in: [types.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L71)

Command capability tiers the page grants to DevTools.

## Remarks

After the handshake, commands travel over a private MessagePort (see [HandshakeMessage](../interfaces/HandshakeMessage.md)), but **the handshake itself
is on the shared `window` bus**: a same-origin script that answers before the real DevTools can grab the port just as well
(`event.ports` is visible to every `message` listener in the same realm).
In other words, the port blocks eavesdropping after the handshake, but not scripts already executing in the page at handshake time.
The whole point of the tiers is to let the page decide the blast radius of this worst case:

- `'none'`: only connection lifecycle commands pass (handshake / PING / CLEAR / DISCONNECT).
  Leaks no library data and changes no state.
- `'readonly'`: additionally passes read-only telemetry (INSPECT_DB / QUERY_ENTITY / GET_BRANCHES).
  Sends entity data onto the page message bus, but does not change database state.
- `'full'`: additionally passes destructive commands (DISCONNECT_RXDB / SWITCH_BRANCH /
  CREATE_BRANCH / DELETE_BRANCH).

Rejected commands are **silently dropped**: replying with an error would give a forger an existence probe.
The legal DevTools reads this page's tier from the HANDSHAKE payload and disables the corresponding UI accordingly.
