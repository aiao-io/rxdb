# LockControllerOptions

Defined in: [widgets/lock.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/lock.ts#L45)

The construction options of [LockController](../classes/LockController.md).

## Properties

### createSalt? \{#createsalt\}

```ts
readonly createSalt?: () => string;
```

Defined in: [widgets/lock.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/lock.ts#L55)

Generates the salt, using `crypto.getRandomValues` by default.

#### Returns

`string`

---

### hasher? \{#hasher\}

```ts
readonly hasher?: PasswordHasher;
```

Defined in: [widgets/lock.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/lock.ts#L53)

The hasher, defaulting to [webCryptoHasher](../variables/webCryptoHasher.md).

---

### host? \{#host\}

```ts
readonly host?: object;
```

Defined in: [widgets/lock.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/lock.ts#L57)

The host event source, used for cross-tab sync of the lock state.

#### addEventListener()

```ts
addEventListener(type, listener): void;
```

##### Parameters

| Parameter  | Type                |
| ---------- | ------------------- |
| `type`     | `"storage"`         |
| `listener` | (`event`) => `void` |

##### Returns

`void`

#### removeEventListener()

```ts
removeEventListener(type, listener): void;
```

##### Parameters

| Parameter  | Type                |
| ---------- | ------------------- |
| `type`     | `"storage"`         |
| `listener` | (`event`) => `void` |

##### Returns

`void`

---

### passwordKey? \{#passwordkey\}

```ts
readonly passwordKey?: string;
```

Defined in: [widgets/lock.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/lock.ts#L51)

The storage key of the password, defaulting to [LOCK\_PASSWORD\_KEY](../variables/LOCK_PASSWORD_KEY.md).

---

### stateKey? \{#statekey\}

```ts
readonly stateKey?: string;
```

Defined in: [widgets/lock.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/lock.ts#L49)

The storage key of the lock state, defaulting to [LOCK\_STATE\_KEY](../variables/LOCK_STATE_KEY.md).

---

### storage \{#storage\}

```ts
readonly storage: StorageLike;
```

Defined in: [widgets/lock.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/lock.ts#L47)

The persistence medium; localStorage is recommended so multiple tabs lock at the same time.
