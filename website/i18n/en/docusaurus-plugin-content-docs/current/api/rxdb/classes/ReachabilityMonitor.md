# ReachabilityMonitor

Defined in: [packages/rxdb/src/network/reachability.ts:118](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/network/reachability.ts#L118)

Remote reachability monitor

## Remarks

**Flips only on evidence.** A successful remote call is evidence of being online, a failure matching [isNetworkError](../functions/isNetworkError.md)
is evidence of being offline; anything else leaves the state untouched — including the backoff beat itself. The backoff beat only means "you may try once more now",
not "already recovered"; optimistically treating the beat as recovery would make the state jitter repeatedly during an outage, showing up in the UI as
the pending push count flashing back to 0.

`navigator.onLine` is asymmetric in both directions: `false` can be trusted as "definitely offline" (the NIC has no link at all),
`true` only says there is a link, not that the backend is reachable, so it is only used to prompt one attempt.

**Host listeners are mounted on demand**: construction has zero side effects on the host; receiving `online` / `offline` events requires
[ReachabilityMonitor.watch](#watch) first. The only consumer of these two events is the sync pipeline, and sync ships with
`@aiao/rxdb-plugin-sync` (US-025 D2) — a database that only configures a local adapter and never syncs should not leave
a pair of listeners outliving the instance on `globalThis` just because of `new RxDB()`. The `report()` main criterion does not depend on it;
the backoff beat is only scheduled for its subscribers (see [ReachabilityMonitor.watch](#watch)) — when nobody has called watch(), being offline is just a state,
and no self-renewing timer is left on the host.

## Example

```typescript
const monitor = new ReachabilityMonitor();

// report uniformly at the remote call exits
try {
  const rows = await remote.findByIds('Recipe', ids);
  monitor.report(null);
} catch (error) {
  monitor.report(error);
  throw error;
}

// the sync driver subscribes to the beat and recovers on success. watch() must come first for the backoff beat and the browser's online / offline
const unwatch = monitor.watch();
monitor.wakeup$.pipe(exhaustMap(() => flushPendingWrites())).subscribe();
```

## Constructors

### Constructor

```ts
new ReachabilityMonitor(options?): ReachabilityMonitor;
```

Defined in: [packages/rxdb/src/network/reachability.ts:152](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/network/reachability.ts#L152)

#### Parameters

| Parameter  | Type                                                          |
| ---------- | ------------------------------------------------------------- |
| `options?` | [`ReachabilityOptions`](../interfaces/ReachabilityOptions.md) |

#### Returns

`ReachabilityMonitor`

## Properties

### online$ \{#online\}

```ts
readonly online$: Observable<boolean>;
```

Defined in: [packages/rxdb/src/network/reachability.ts:135](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/network/reachability.ts#L135)

The change stream of the current reachability judgment (deduplicated, subscribing yields the current value immediately)

---

### wakeup$ \{#wakeup\}

```ts
readonly wakeup$: Observable<void>;
```

Defined in: [packages/rxdb/src/network/reachability.ts:145](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/network/reachability.ts#L145)

The "you may retry a sync now" beat

#### Remarks

Emitted with backoff `base * 2 ** (attempt - 1)` (capped at `maxDelayMs`) while offline with [ReachabilityMonitor.watch](#watch) subscribers,
and the browser `online` event also prompts one. Subscribers should consume it with single-flight operators like `exhaustMap`
— the beat may overlap with other trigger sources.

## Accessors

### online \{#online-1\}

#### Get Signature

```ts
get online(): boolean;
```

Defined in: [packages/rxdb/src/network/reachability.ts:148](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/network/reachability.ts#L148)

Whether it is currently judged reachable

##### Returns

`boolean`

## Methods

### destroy() \{#destroy\}

```ts
destroy(): void;
```

Defined in: [packages/rxdb/src/network/reachability.ts:231](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/network/reachability.ts#L231)

Stops monitoring: removes the event listeners and cancels the pending beat

#### Returns

`void`

#### Remarks

Idempotent. After `destroy()`, [ReachabilityMonitor.report](#report) no longer changes the state.

---

### report() \{#report\}

```ts
report(error): void;
```

Defined in: [packages/rxdb/src/network/reachability.ts:214](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/network/reachability.ts#L214)

Reports the result of one remote call

#### Parameters

| Parameter | Type      | Description                                                       |
| --------- | --------- | ----------------------------------------------------------------- |
| `error`   | `unknown` | The error thrown by the call; pass `null` when the call succeeded |

#### Returns

`void`

#### Remarks

Unrecognized errors (including all HTTP responses with a numeric `status`) **do not change the state**: getting a status code
means the connection works, 401 / 422 / 503 are all answers given by the remote, not a broken cable.

---

### watch() \{#watch\}

```ts
watch(): () => void;
```

Defined in: [packages/rxdb/src/network/reachability.ts:187](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/network/reachability.ts#L187)

Starts receiving the host's `online` / `offline` events

#### Returns

The function that undoes this subscription; idempotent, repeated calls count once

() => `void`

#### Remarks

Reference counted: the first subscriber mounts the listeners, and they are only removed when the last one leaves. There may be multiple
consumers on the same host, and none should stop receiving events because another one left.

Every 0-to-1 transition **re-reads** `navigator.onLine`: the listening mounts later than construction (plugins install inside
`connect()`), the cable may have been unplugged in between, and nobody was listening at the moment it was unplugged.

The backoff beat lives and dies with the reference count: at 0 the beat stops, back at 1 and currently offline it keeps scheduling. The beat only
matters to subscribers of `wakeup$`; self-renewing with nobody listening just wastes the host's timer.

A call after `destroy()` is a no-op, returning an undo function that does nothing.

#### Example

```typescript
// plugin scope: start listening on install, auto-remove on teardown
scope.acquire(() => rxdb.reachability.watch(), 'sync:reachability');
```
