# LockController

Defined in: [widgets/lock.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/lock.ts#L72)

Lock screen: covers the UI and unlocks with a password.

## Remarks

This is "anti-shoulder-surfing", not a security boundary: both the password hash and the lock
state live in local storage, and the data itself is not encrypted.
The lock state persists and syncs across tabs, so refreshing the page or opening a new tab cannot bypass it.

## Constructors

### Constructor

```ts
new LockController(options): LockController;
```

Defined in: [widgets/lock.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/lock.ts#L87)

Creates the controller and reads the saved lock state.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`LockControllerOptions`](../interfaces/LockControllerOptions.md) | Storage, hasher, and host. |

#### Returns

`LockController`

## Accessors

### locked \{#locked\}

#### Get Signature

```ts
get locked(): ReadableStore<boolean>;
```

Defined in: [widgets/lock.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/lock.ts#L79)

Whether the screen is locked.

##### Returns

[`ReadableStore`](../interfaces/ReadableStore.md)&lt;`boolean`&gt;

## Methods

### destroy() \{#destroy\}

```ts
destroy(): void;
```

Defined in: [widgets/lock.ts:146](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/lock.ts#L146)

Stops cross-tab listening.

#### Returns

`void`

***

### hasPassword() \{#haspassword\}

```ts
hasPassword(): boolean;
```

Defined in: [widgets/lock.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/lock.ts#L96)

Whether a lock screen password is set; when unset, the lock screen requires setting one first.

#### Returns

`boolean`

***

### lock() \{#lock\}

```ts
lock(): void;
```

Defined in: [widgets/lock.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/lock.ts#L101)

Locks the UI.

#### Returns

`void`

***

### resetPassword() \{#resetpassword\}

```ts
resetPassword(): void;
```

Defined in: [widgets/lock.ts:140](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/lock.ts#L140)

Forgot password: clears the password and unlocks. Data is unaffected.

#### Returns

`void`

***

### setPassword() \{#setpassword\}

```ts
setPassword(password): Promise<void>;
```

Defined in: [widgets/lock.ts:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/lock.ts#L111)

Sets (or changes) the lock screen password and unlocks.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `password` | `string` | The plaintext password. |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

Throws when the password is empty, or when the environment lacks Web Crypto.

***

### unlock() \{#unlock\}

```ts
unlock(): void;
```

Defined in: [widgets/lock.ts:134](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/lock.ts#L134)

Unlocks directly (no verification).

#### Returns

`void`

***

### unlockWith() \{#unlockwith\}

```ts
unlockWith(password): Promise<boolean>;
```

Defined in: [widgets/lock.ts:124](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/lock.ts#L124)

Verifies the password and unlocks.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `password` | `string` | The plaintext password. |

#### Returns

`Promise`&lt;`boolean`&gt;

`true` when correct and now unlocked; `false` when no password is set or the password is wrong.
