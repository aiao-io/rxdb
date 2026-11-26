# PushInFlightRegistry

Defined in: [packages/rxdb-plugin-history/src/push-inflight.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/push-inflight.ts#L48)

In-process registry of "which changes are currently flying to the remote".

## Remarks

It exists because of a timing gap: undo's criterion is "not yet pushed", and the data source for that,
`RxDBSync.lastPushedChangeId`, is only written when a push **commits**. The push's remote round trip happens outside the transaction,
so in the window between "already sent" and "watermark not yet advanced", `undo()` would allow through a change that has actually already reached
the remote.

Undo **produces no new change rows** (`undo-redo-apply.ts` only marks the original row with `revertChangeId`),
and the outbound query filters `revertChangeId = null` — from then on the remote has the change and the local side does not, and no
push will ever deliver that difference. This registry fills that window: in-flight counts as pushed.

**Covers this process only.** When multiple tabs / Tauri processes share one local database, another process's push
is invisible here. Cross-process would require a lease row in the database, and the push path currently has no
cross-process mutual exclusion at all (two processes would each push the same batch of changes) — that is a different problem, not one to pretend to solve here.

## Constructors

### Constructor

```ts
new PushInFlightRegistry(): PushInFlightRegistry;
```

#### Returns

`PushInFlightRegistry`

## Methods

### session() \{#session\}

```ts
session(): PushInFlightSession;
```

Defined in: [packages/rxdb-plugin-history/src/push-inflight.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/push-inflight.ts#L58)

Starts a round of claims.

#### Returns

[`PushInFlightSession`](../interfaces/PushInFlightSession.md)

The claim handle of this round; the caller must call [PushInFlightSession.release](../interfaces/PushInFlightSession.md#release) in `finally`

***

### snapshot() \{#snapshot\}

```ts
snapshot(): ReadonlyMap<string, number>;
```

Defined in: [packages/rxdb-plugin-history/src/push-inflight.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/push-inflight.ts#L80)

All currently in-flight claims, taking the maximum per repository.

#### Returns

`ReadonlyMap`&lt;`string`, `number`&gt;

`namespace:entity` -> the largest change id in flight; an empty Map when there are no claims
