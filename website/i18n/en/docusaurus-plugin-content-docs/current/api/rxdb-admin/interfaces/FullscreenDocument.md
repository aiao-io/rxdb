# FullscreenDocument

Defined in: [widgets/fullscreen.ts:4](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/fullscreen.ts#L4)

The document capabilities needed for fullscreen, which `document` naturally satisfies.

## Properties

### documentElement \{#documentelement\}

```ts
readonly documentElement: object;
```

Defined in: [widgets/fullscreen.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/fullscreen.ts#L10)

The root element.

#### requestFullscreen()

```ts
requestFullscreen(): Promise<void>;
```

##### Returns

`Promise`&lt;`void`&gt;

---

### fullscreenElement \{#fullscreenelement\}

```ts
readonly fullscreenElement: unknown;
```

Defined in: [widgets/fullscreen.ts:6](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/fullscreen.ts#L6)

The element currently in fullscreen.

---

### fullscreenEnabled \{#fullscreenenabled\}

```ts
readonly fullscreenEnabled: boolean;
```

Defined in: [widgets/fullscreen.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/fullscreen.ts#L8)

Whether the environment allows entering fullscreen (false when an iframe lacks the `allow="fullscreen"` permission).

## Methods

### addEventListener() \{#addeventlistener\}

```ts
addEventListener(type, listener): void;
```

Defined in: [widgets/fullscreen.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/fullscreen.ts#L14)

Listens for fullscreen changes.

#### Parameters

| Parameter  | Type                 |
| ---------- | -------------------- |
| `type`     | `"fullscreenchange"` |
| `listener` | () => `void`         |

#### Returns

`void`

---

### exitFullscreen() \{#exitfullscreen\}

```ts
exitFullscreen(): Promise<void>;
```

Defined in: [widgets/fullscreen.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/fullscreen.ts#L12)

Exits fullscreen.

#### Returns

`Promise`&lt;`void`&gt;

---

### removeEventListener() \{#removeeventlistener\}

```ts
removeEventListener(type, listener): void;
```

Defined in: [widgets/fullscreen.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/fullscreen.ts#L16)

Removes the listener.

#### Parameters

| Parameter  | Type                 |
| ---------- | -------------------- |
| `type`     | `"fullscreenchange"` |
| `listener` | () => `void`         |

#### Returns

`void`
