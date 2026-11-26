# SyncStateHub

Defined in: [packages/rxdb/src/sync-state.ts:158](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L158)

Sync state aggregator

## Remarks

The three upstream streams are read-only; `syncing` / `lastError` / `lastConflict` / `lastRejections` are actively reported by the push-back chain
([beginRound](#beginround), [reportError](#reporterror), [reportConflict](#reportconflict), etc.).

[destroy](#destroy) only disconnects the upstream subscriptions and does not close [state$](#state) — if closed, framework components
still mounted at the moment of destruction would read a completed stream and render an empty panel. Keeping the last snapshot is closer to the truth.

## Example

```ts
const sub = rxdb.syncState.state$.subscribe(state => {
  banner.textContent = state.online ? `pending ${state.pendingCount}` : 'offline';
});
```

## Constructors

### Constructor

```ts
new SyncStateHub(sources): SyncStateHub;
```

Defined in: [packages/rxdb/src/sync-state.ts:181](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L181)

#### Parameters

| Parameter | Type                                                    |
| --------- | ------------------------------------------------------- |
| `sources` | [`SyncStateSources`](../interfaces/SyncStateSources.md) |

#### Returns

`SyncStateHub`

## Properties

### state$ \{#state\}

```ts
readonly state$: Observable<SyncState>;
```

Defined in: [packages/rxdb/src/sync-state.ts:174](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L174)

The aggregated snapshot stream; subscribing yields the current value immediately

## Accessors

### snapshot \{#snapshot\}

#### Get Signature

```ts
get snapshot(): SyncState;
```

Defined in: [packages/rxdb/src/sync-state.ts:177](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L177)

The current snapshot, for synchronous read scenarios where subscribing is inconvenient

##### Returns

[`SyncState`](../interfaces/SyncState.md)

## Methods

### beginRound() \{#beginround\}

```ts
beginRound(): void;
```

Defined in: [packages/rxdb/src/sync-state.ts:305](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L305)

A push-back round begins

#### Returns

`void`

---

### bindPullableRefresh() \{#bindpullablerefresh\}

```ts
bindPullableRefresh(refresh): () => void;
```

Defined in: [packages/rxdb/src/sync-state.ts:267](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L267)

Wires up the executor of "recompute the pending pull count" and returns an unbind function

#### Parameters

| Parameter | Type         | Description                                                                                             |
| --------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| `refresh` | () => `void` | The callback that performs the recomputation, usually a wrapper of `SyncManager.refreshPullableCount()` |

#### Returns

The unbind function

() => `void`

#### Remarks

Same structure and same rationale as [bindPushableCount](#bindpushablecount): the executor follows the **connection epoch** (`scoped` plugins),
while this aggregator follows the instance, so it can only be wired up by plugins at install time and unwired at release time.

The callback **must not throw and must not return pending rejections**: this is a fire-and-forget signal hop,
with neither a caller to catch errors nor a place to retry. Error handling belongs to the executor itself.

---

### bindPushableCount() \{#bindpushablecount\}

```ts
bindPushableCount(source$): () => void;
```

Defined in: [packages/rxdb/src/sync-state.ts:222](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L222)

Wires up the pending push count stream of the changelog path and returns an unbind function

#### Parameters

| Parameter | Type                         | Description                                                            |
| --------- | ---------------------------- | ---------------------------------------------------------------------- |
| `source$` | `Observable`&lt;`number`&gt; | The pending push count stream, usually `HistoryManager.pushableCount$` |

#### Returns

The unbind function: disconnects the subscription and zeroes this path's reading

() => `void`

#### Remarks

**Not a constructor parameter**: the changelog path lives entirely inside `@aiao/rxdb-plugin-history` (US-025 phase C),
its lifecycle is the **connection epoch** (`scoped` plugins are installed at `connect()` and released in reverse order with the scope on disconnect),
while this aggregator follows the instance and survives across disconnections — the panel must keep showing the last reading during disconnection.
The two have different lifetimes, so it can only be wired up by the plugin at install time and unwired at release time.

On unbind it **zeroes instead of keeping the last number**: once the plugin is gone, nothing behind that number maintains it anymore;
keeping it would make "history plugin not installed" and "installed but nothing pending" look identical on the panel.
The QueryCache outbox count goes through [reportOutboxCount](#reportoutboxcount) and is not affected here.

---

### destroy() \{#destroy\}

```ts
destroy(): void;
```

Defined in: [packages/rxdb/src/sync-state.ts:344](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L344)

Disconnects the upstream subscriptions; [state$](#state) keeps the last snapshot

#### Returns

`void`

---

### endRound() \{#endround\}

```ts
endRound(): void;
```

Defined in: [packages/rxdb/src/sync-state.ts:310](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L310)

A push-back round ends, whether it succeeded or not

#### Returns

`void`

---

### reportConflict() \{#reportconflict\}

```ts
reportConflict(report): void;
```

Defined in: [packages/rxdb/src/sync-state.ts:325](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L325)

Reports one conflict determination

#### Parameters

| Parameter | Type                                                        |
| --------- | ----------------------------------------------------------- |
| `report`  | [`SyncConflictReport`](../interfaces/SyncConflictReport.md) |

#### Returns

`void`

---

### reportError() \{#reporterror\}

```ts
reportError(error): void;
```

Defined in: [packages/rxdb/src/sync-state.ts:315](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L315)

Reports one failure of this round

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `error`   | `unknown` |

#### Returns

`void`

---

### reportOfflineWrite() \{#reportofflinewrite\}

```ts
reportOfflineWrite(): void;
```

Defined in: [packages/rxdb/src/sync-state.ts:299](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L299)

Reports one offline write enqueued

#### Returns

`void`

#### Remarks

The write path only knows it just enqueued one and not the total — counting the whole table again for a certain `+1` means trading a database read for an already-known answer.
The authoritative value is given by the recomputation when the push-back finishes.

---

### reportOutboxCount() \{#reportoutboxcount\}

```ts
reportOutboxCount(count): void;
```

Defined in: [packages/rxdb/src/sync-state.ts:288](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L288)

Reports the current outbox pending push count of the QueryCache path (absolute value)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `count`   | `number` |

#### Returns

`void`

#### Remarks

This number only changes on two occasions: an offline write enqueued ([reportOfflineWrite](#reportofflinewrite)), and a push-back round
advancing the watermark. Both report, so "reporting per event" is complete here rather than a compromise on a live stream.

The division of labor with [reportOfflineWrite](#reportofflinewrite): that one only knows "one more"; this is the authoritative value recounted
when the push-back finishes and entirely overwrites the previously accumulated number.

---

### reportRejections() \{#reportrejections\}

```ts
reportRejections(rejections): void;
```

Defined in: [packages/rxdb/src/sync-state.ts:338](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L338)

Reports one push round's rejection list

#### Parameters

| Parameter    | Type                                                         | Description                                                                  |
| ------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `rejections` | readonly [`SyncRejection`](../interfaces/SyncRejection.md)[] | The entities rejected this round; stored into the snapshot as-is, not copied |

#### Returns

`void`

#### Remarks

Called by `@aiao/rxdb-plugin-sync`'s push repository after the local commit succeeds; not reported when the commit fails.
An empty array means "nothing rejected this round", not "cleared": a rejection is a historical fact and, like [reportConflict](#reportconflict), is kept until the next round's rejection.

---

### reportSuccess() \{#reportsuccess\}

```ts
reportSuccess(): void;
```

Defined in: [packages/rxdb/src/sync-state.ts:320](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L320)

Reports a round with no failures throughout and clears the previous error

#### Returns

`void`

---

### requestPullableRefresh() \{#requestpullablerefresh\}

```ts
requestPullableRefresh(): void;
```

Defined in: [packages/rxdb/src/sync-state.ts:250](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L250)

Requests a recomputation of the pending pull count

#### Returns

`void`

#### Remarks

Called by the **remote adapter** after the realtime subscription recovers (the `SUBSCRIBED` callback of `@aiao/rxdb-adapter-supabase`):
during the outage the local side heard none of the changes accumulated remotely, and re-subscribing only guarantees
"audible from now on" without backfilling history, so it must go back and recount by each repository's watermark.

**It is only a request, not an execution.** The logic that actually recounts reads each repository's sync memory and lives entirely inside
`@aiao/rxdb-plugin-history` (US-025 phase C); the adapter must not know it — and vice versa.
Without the history plugin installed this is a **no-op**: the pending pull count is unmaintained anyway, and requesting a recomputation
with no home should not blow up the realtime subscription's recovery path.
