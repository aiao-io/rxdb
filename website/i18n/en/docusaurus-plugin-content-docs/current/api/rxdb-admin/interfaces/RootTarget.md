# RootTarget

Defined in: [shell/root-binding.ts:4](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/root-binding.ts#L4)

The minimal contract of the root element (`<html>`).

## Properties

### style \{#style\}

```ts
readonly style: object;
```

Defined in: [shell/root-binding.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/root-binding.ts#L10)

The inline styles.

#### removeProperty()

```ts
removeProperty(name): string;
```

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `name`    | `string` |

##### Returns

`string`

#### setProperty()

```ts
setProperty(name, value): void;
```

##### Parameters

| Parameter | Type     |
| --------- | -------- |
| `name`    | `string` |
| `value`   | `string` |

##### Returns

`void`

## Methods

### removeAttribute() \{#removeattribute\}

```ts
removeAttribute(name): void;
```

Defined in: [shell/root-binding.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/root-binding.ts#L8)

Removes an attribute.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `name`    | `string` |

#### Returns

`void`

---

### setAttribute() \{#setattribute\}

```ts
setAttribute(name, value): void;
```

Defined in: [shell/root-binding.ts:6](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/root-binding.ts#L6)

Sets an attribute.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `name`    | `string` |
| `value`   | `string` |

#### Returns

`void`
