# ReachabilityOptions

Defined in: [packages/rxdb/src/network/reachability.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/network/reachability.ts#L41)

Construction options of [ReachabilityMonitor](../classes/ReachabilityMonitor.md).

## Properties

### addEventListener? \{#addeventlistener\}

```ts
readonly addEventListener?: (type, listener) => void;
```

Defined in: [packages/rxdb/src/network/reachability.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/network/reachability.ts#L57)

Registers the `online` / `offline` listeners; when omitted, the global `addEventListener` is auto-detected.

#### Parameters

| Parameter  | Type                      |
| ---------- | ------------------------- |
| `type`     | `"online"` \| `"offline"` |
| `listener` | () => `void`              |

#### Returns

`void`

---

### baseDelayMs? \{#basedelayms\}

```ts
readonly baseDelayMs?: number;
```

Defined in: [packages/rxdb/src/network/reachability.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/network/reachability.ts#L43)

Backoff starting interval; defaults to 1000ms.

---

### maxDelayMs? \{#maxdelayms\}

```ts
readonly maxDelayMs?: number;
```

Defined in: [packages/rxdb/src/network/reachability.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/network/reachability.ts#L46)

Backoff ceiling interval; defaults to 30000ms.

---

### navigatorOnLine? \{#navigatoronline\}

```ts
readonly navigatorOnLine?: () => boolean;
```

Defined in: [packages/rxdb/src/network/reachability.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/network/reachability.ts#L54)

Reads `navigator.onLine`.

#### Returns

`boolean`

#### Remarks

When omitted, the global `navigator` is auto-detected; explicitly passing a value other than `undefined` can
be used for tests and non-browser hosts.

---

### removeEventListener? \{#removeeventlistener\}

```ts
readonly removeEventListener?: (type, listener) => void;
```

Defined in: [packages/rxdb/src/network/reachability.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/network/reachability.ts#L60)

Unregisters the listener; must be provided as a pair with [ReachabilityOptions.addEventListener](#addeventlistener).

#### Parameters

| Parameter  | Type                      |
| ---------- | ------------------------- |
| `type`     | `"online"` \| `"offline"` |
| `listener` | () => `void`              |

#### Returns

`void`
