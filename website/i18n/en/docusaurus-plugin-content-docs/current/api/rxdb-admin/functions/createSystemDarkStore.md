# createSystemDarkStore()

```ts
function createSystemDarkStore(matchMedia): object;
```

Defined in: [theme/system-theme.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/theme/system-theme.ts#L11)

Observes whether the system is in dark mode.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `matchMedia` | [`MatchMedia`](../type-aliases/MatchMedia.md) \| `undefined` | The host's `matchMedia`; when absent (SSR / tests) the mode is always light. |

## Returns

`object`

A read-only store and a stop function.

### stop

```ts
stop: () => void;
```

#### Returns

`void`

### store

```ts
store: ReadableStore<boolean>;
```
