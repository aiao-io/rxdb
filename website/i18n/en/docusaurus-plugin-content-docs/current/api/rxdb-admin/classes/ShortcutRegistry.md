# ShortcutRegistry

Defined in: [shortcuts/registry.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L102)

Shortcut registry: unified listening, platform differences, input and IME protection, preference toggles.

## Remarks

The shell ships a few built-in shortcuts; apps add their own via [ShortcutRegistry.register](#register),
and every registered entry appears in the "Shortcuts" tab of the preferences drawer, where each can be toggled individually.

## Constructors

### Constructor

```ts
new ShortcutRegistry(options): ShortcutRegistry;
```

Defined in: [shortcuts/registry.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L113)

Creates the registry.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | \{ `platform`: [`ShortcutPlatform`](../type-aliases/ShortcutPlatform.md); `preferences`: [`ShortcutPreferences`](../interfaces/ShortcutPreferences.md); \} | Preferences and the running platform. |
| `options.platform` | [`ShortcutPlatform`](../type-aliases/ShortcutPlatform.md) | - |
| `options.preferences` | [`ShortcutPreferences`](../interfaces/ShortcutPreferences.md) | - |

#### Returns

`ShortcutRegistry`

## Properties

### list \{#list\}

```ts
readonly list: ReadableStore<readonly ShortcutInfo[]>;
```

Defined in: [shortcuts/registry.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L107)

UI info of the registered shortcuts, updated with registrations and preference changes.

## Methods

### attach() \{#attach\}

```ts
attach(target): () => void;
```

Defined in: [shortcuts/registry.ts:190](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L190)

Listens for keydown on the target in the capture phase, ahead of app components.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `target` | [`ShortcutTarget`](../interfaces/ShortcutTarget.md) | Usually `window`. |

#### Returns

A function that removes the listener.

() => `void`

***

### handle() \{#handle\}

```ts
handle(event): boolean;
```

Defined in: [shortcuts/registry.ts:175](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L175)

Handles one keyboard event.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | [`ShortcutKeyboardEvent`](../interfaces/ShortcutKeyboardEvent.md) | The keyboard event. |

#### Returns

`boolean`

`true` when matched and handled.

***

### isEnabled() \{#isenabled\}

```ts
isEnabled(id): boolean;
```

Defined in: [shortcuts/registry.ts:155](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L155)

Whether the shortcut is currently enabled.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The shortcut id. |

#### Returns

`boolean`

`true` when the master switch is on and the shortcut is not individually disabled.

***

### register() \{#register\}

```ts
register(definition): () => void;
```

Defined in: [shortcuts/registry.ts:134](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L134)

Registers a shortcut.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `definition` | [`ShortcutDefinition`](../interfaces/ShortcutDefinition.md) | The declaration. |

#### Returns

An unregister function.

() => `void`

#### Throws

Throws when the combo is invalid, the id is duplicated, or it matches the same keystroke as an
already registered entry on this instance's platform (`Mod` is `Meta` on mac and `Ctrl` elsewhere).

***

### setEnabled() \{#setenabled\}

```ts
setEnabled(id, enabled): void;
```

Defined in: [shortcuts/registry.ts:165](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L165)

Enables or disables a single shortcut.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The shortcut id. |
| `enabled` | `boolean` | Whether it is enabled. |

#### Returns

`void`
