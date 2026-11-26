# CommitCapabilityInfo

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-capability.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-capability.ts#L46)

The read-only view of the capability state row in the database.

## Extends

- [`CommitCapabilityVersions`](CommitCapabilityVersions.md)

## Properties

### codecVersion \{#codecversion\}

```ts
readonly codecVersion: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-capability.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-capability.ts#L42)

The patch codec version

#### Inherited from

[`CommitCapabilityVersions`](CommitCapabilityVersions.md).[`codecVersion`](CommitCapabilityVersions.md#codecversion)

***

### enabled \{#enabled\}

```ts
readonly enabled: boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-capability.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-capability.ts#L48)

Whether the commit capability is enabled

***

### enabledAt \{#enabledat\}

```ts
readonly enabledAt: Date | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-capability.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-capability.ts#L50)

The enable moment; `null` when not enabled

***

### protocolVersion \{#protocolversion\}

```ts
readonly protocolVersion: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-capability.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-capability.ts#L38)

The command-layer protocol version

#### Inherited from

[`CommitCapabilityVersions`](CommitCapabilityVersions.md).[`protocolVersion`](CommitCapabilityVersions.md#protocolversion)

***

### schemaVersion \{#schemaversion\}

```ts
readonly schemaVersion: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-capability.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-capability.ts#L40)

The commit graph's physical shape version

#### Inherited from

[`CommitCapabilityVersions`](CommitCapabilityVersions.md).[`schemaVersion`](CommitCapabilityVersions.md#schemaversion)
