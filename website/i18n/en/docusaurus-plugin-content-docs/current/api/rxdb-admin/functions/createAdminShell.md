# createAdminShell()

```ts
function createAdminShell<TIcon>(options): AdminShell<TIcon>;
```

Defined in: [shell/create.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/create.ts#L50)

Creates the admin shell runtime.

## Type Parameters

| Type Parameter                            | Default type |
| ----------------------------------------- | ------------ |
| <a id="type-parameter-ticon"></a> `TIcon` | `unknown`    |

## Parameters

| Parameter | Type                                                                     | Description        |
| --------- | ------------------------------------------------------------------------ | ------------------ |
| `options` | [`AdminShellOptions`](../interfaces/AdminShellOptions.md)&lt;`TIcon`&gt; | The shell options. |

## Returns

[`AdminShell`](../interfaces/AdminShell.md)&lt;`TIcon`&gt;

The shell runtime.

## Remarks

The shell is independent of the routing library and UI framework: the application calls `syncRoute` after route changes and drives the router from the `navigate` callback.
After creation, call `attach()` to bind the browser (recommended before the first render to avoid a theme flash).
