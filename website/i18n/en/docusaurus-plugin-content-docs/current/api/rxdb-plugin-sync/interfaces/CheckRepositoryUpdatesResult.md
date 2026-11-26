# CheckRepositoryUpdatesResult

Defined in: [packages/rxdb-plugin-sync/src/check-repository-updates.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/check-repository-updates.ts#L19)

Repository update check result.

## Properties

### hasUpdates \{#hasupdates\}

```ts
hasUpdates: boolean;
```

Defined in: [packages/rxdb-plugin-sync/src/check-repository-updates.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/check-repository-updates.ts#L43)

Whether there are updates

---

### localLastPullRemoteChangeId \{#locallastpullremotechangeid\}

```ts
localLastPullRemoteChangeId: number | null;
```

Defined in: [packages/rxdb-plugin-sync/src/check-repository-updates.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/check-repository-updates.ts#L33)

The remote changeId of the local last pull

---

### pendingCount \{#pendingcount\}

```ts
pendingCount: number;
```

Defined in: [packages/rxdb-plugin-sync/src/check-repository-updates.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/check-repository-updates.ts#L38)

The number of changes awaiting pull

---

### remoteLatestChangeId \{#remotelatestchangeid\}

```ts
remoteLatestChangeId: number;
```

Defined in: [packages/rxdb-plugin-sync/src/check-repository-updates.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/check-repository-updates.ts#L28)

The remote's latest changeId

---

### repository \{#repository\}

```ts
repository: RepositoryIdentifier;
```

Defined in: [packages/rxdb-plugin-sync/src/check-repository-updates.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/check-repository-updates.ts#L23)

The repository identifier
