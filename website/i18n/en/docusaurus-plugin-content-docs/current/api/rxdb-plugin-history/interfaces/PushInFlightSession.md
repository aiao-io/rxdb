# PushInFlightSession

Defined in: [packages/rxdb-plugin-history/src/push-inflight.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/push-inflight.ts#L14)

The claim handle held during one push call.

One `pushRepository` may push multiple repositories at once (cascading), so `claim` may be called multiple times,
while [release](#release) clears all of this round's claims in one go — whoever opens also closes, and no early return
along any path can leak one.

## Methods

### claim() \{#claim\}

```ts
claim(repositoryKey, maxChangeId): void;
```

Defined in: [packages/rxdb-plugin-history/src/push-inflight.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/push-inflight.ts#L25)

Declares that this round is sending a repository's changes with id ≤ `maxChangeId` to the remote.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `repositoryKey` | `string` | `namespace:entity` |
| `maxChangeId` | `number` | The largest change id sent in this round |

#### Returns

`void`

#### Remarks

Repeated claims on the same repository take the **larger** value: the cascading path pushes the same plan in phases, and a later phase must not
shrink the range a previous phase already covered.

***

### release() \{#release\}

```ts
release(): void;
```

Defined in: [packages/rxdb-plugin-history/src/push-inflight.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/push-inflight.ts#L28)

Revokes all of this session's claims. Repeated calls are no-ops.

#### Returns

`void`
