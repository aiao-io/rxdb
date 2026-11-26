# WorkingTreeCaptureRuntimeOptions

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L83)

The host capabilities needed to construct the capture runtime.

## Properties

### domain \{#domain\}

```ts
readonly domain: VersionedDomain;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L88)

The versioned domain: entity classification is fixed; a getter may return the raw SQL judgment domain including newly created shadow tables

---

### entityManager \{#entitymanager\}

```ts
readonly entityManager: EntityManager;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L85)

Used to create working tree unit instances

---

### newUnitId? \{#newunitid\}

```ts
readonly newUnitId?: () => string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L104)

The unit id generator; only tests need to inject a deterministic value

#### Returns

`string`

---

### systemEntityIdentities \{#systementityidentities\}

```ts
readonly systemEntityIdentities: ReadonlySet<string>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L101)

The identity set of system entities (`namespace:name`, e.g. `rxdb:RxDBBranch`); used when the namespace is known

---

### systemEntityNames \{#systementitynames\}

```ts
readonly systemEntityNames: ReadonlySet<string>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L98)

The bare-name set of system entities; used when only the entity name is available (mount point 4)

#### Remarks

Two projections of the same registry as [systemEntityIdentities](#systementityidentities), not two lists. Bare-name judgment inherently
cannot see namespaces, so it only speaks when [domain](#domain) does not recognize the name — see
[WorkingTreeCaptureRuntime.targetClassOf](../classes/WorkingTreeCaptureRuntime.md#targetclassof).
