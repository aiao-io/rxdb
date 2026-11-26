# HttpChangeFeedNotificationReport

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:404](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L404)

The fact when a **parseable** change notification is received (US-023 AC#24).

## Remarks

The sole reason this outlet exists is that **self-echo suppression happens inside the package** (D6): a suppressed notification never reaches `RxDB.invalidateRemoteEntity`, and from core's event stream outside the package it looks exactly like "never received at all". Trying to back out the suppression count from "backend broadcasts − core invalidations" would also count notifications lost while disconnected.

**The report structure cannot carry row data** (D8): the fields are fixed, and any extra keys in the payload are never passed through. The notification's semantics is "some entity changed", not "what it changed into" — local rows have exactly one write path: `#pull → upsertMany`.

## Properties

### clientId? \{#clientid\}

```ts
clientId?: string;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:412](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L412)

The initiating `clientId` from the notification; `undefined` when the payload didn't carry one

***

### entity \{#entity\}

```ts
entity: string;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:408](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L408)

The entity name from the notification, passed through as-is (names this client hasn't registered appear here too, see D9)

***

### namespace \{#namespace\}

```ts
namespace: string;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:410](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L410)

The namespace from the notification; `'public'` when the payload didn't carry one

***

### suppressed \{#suppressed\}

```ts
suppressed: boolean;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:420](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L420)

Whether this notification didn't report an invalidation because "the initiator is this machine" (D6).

#### Remarks

When `true`, this package **did not** call `RxDB.invalidateRemoteEntity` — that's not an error: this machine just wrote, local is already up to date, and asking the remote again would be a wasted trip.

***

### url \{#url\}

```ts
url: string;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:406](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L406)

Absolute URL of the notification endpoint
