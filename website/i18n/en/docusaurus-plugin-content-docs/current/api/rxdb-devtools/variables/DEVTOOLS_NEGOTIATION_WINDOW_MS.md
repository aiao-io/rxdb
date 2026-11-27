# DEVTOOLS_NEGOTIATION_WINDOW_MS

```ts
const DEVTOOLS_NEGOTIATION_WINDOW_MS: 1000;
```

Defined in: [v2/constants.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/constants.ts#L23)

Version decision window, in milliseconds.

## Remarks

Starts when the **legacy HANDSHAKE is first staged**, not when the panel initializes. Starting from init would let
content-script injection waiting (the user authorization of `chrome.permissions.request`, with unbounded delay)
exhaust the window, so the "both sides support v2" combination would reliably fall back to v1.
