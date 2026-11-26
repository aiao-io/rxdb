# PatchWalkArgs

Defined in: [packages/rxdb-adapter-encrypted/src/encrypt-patch.ts:7](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/encrypt-patch.ts#L7)

Entity identity, primary key, and keyring required to encrypt/decrypt undo/redo change patches.

## Properties

### entity \{#entity\}

```ts
entity: EntityMetadata;
```

Defined in: [packages/rxdb-adapter-encrypted/src/encrypt-patch.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/encrypt-patch.ts#L8)

---

### keyring \{#keyring\}

```ts
keyring: Keyring;
```

Defined in: [packages/rxdb-adapter-encrypted/src/encrypt-patch.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/encrypt-patch.ts#L11)

---

### patch \{#patch\}

```ts
patch: Record<string, unknown>;
```

Defined in: [packages/rxdb-adapter-encrypted/src/encrypt-patch.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/encrypt-patch.ts#L10)

---

### primaryKeyString \{#primarykeystring\}

```ts
primaryKeyString: RxDBEntityId;
```

Defined in: [packages/rxdb-adapter-encrypted/src/encrypt-patch.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/encrypt-patch.ts#L9)
