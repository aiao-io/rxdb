# LeaderElection

Defined in: [packages/utils/src/@browser/leader-election.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/leader-election.ts#L41)

A Leader Election implementation based on the Web Locks API (with BroadcastChannel fallback), used to elect a single leader among multiple browser tabs/windows.

The main path uses the Web Locks API (the lock is released automatically when the tab closes, more reliable than heartbeats). The fallback path uses BroadcastChannel + timestamp competitive election (for environments such as Safari Private Browsing).

## Example

```ts
const leader = new LeaderElection('my-app');

const unsubscribe = leader.elect(isLeader => {
  if (isLeader) {
    console.log('the current tab became the leader');
    // Do things that only the leader should do, e.g.:
    // - open a WebSocket connection to the server
    // - run scheduled sync tasks
  }
});

// synchronously check whether this tab is the leader
console.log(leader.isLeader);

// unsubscribe
unsubscribe();

// released automatically when the page closes; can also be called manually
leader.dispose();
```

## Constructors

### Constructor

```ts
new LeaderElection(name): LeaderElection;
```

Defined in: [packages/utils/src/@browser/leader-election.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/leader-election.ts#L68)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `name` | `string` | Lock name; instances with the same name compete for the same leader position |

#### Returns

`LeaderElection`

## Accessors

### isLeader \{#isleader\}

#### Get Signature

```ts
get isLeader(): boolean;
```

Defined in: [packages/utils/src/@browser/leader-election.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/leader-election.ts#L61)

Whether this instance is currently the leader

##### Returns

`boolean`

## Methods

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: [packages/utils/src/@browser/leader-election.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/leader-election.ts#L100)

Releases the leader role and cleans up resources

#### Returns

`void`

***

### elect() \{#elect\}

```ts
elect(callback): () => boolean;
```

Defined in: [packages/utils/src/@browser/leader-election.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/leader-election.ts#L81)

Participates in leader election

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `callback` | (`isLeader`) => `void` | Called when this instance becomes the leader, with argument `true` |

#### Returns

Unsubscribe function

() => `boolean`
