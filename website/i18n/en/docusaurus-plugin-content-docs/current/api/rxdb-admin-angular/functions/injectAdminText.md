# injectAdminText()

```ts
function injectAdminText(): (key, params?) => string;
```

Defined in: [rxdb-admin-angular/src/context.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/context.ts#L73)

The translation function. Calling it in a template, `computed` or `effect` establishes a signal dependency on `shell.text`,
so OnPush + zoneless components also re-render after language or catalog changes. Must be called in an injection context.

## Returns

The function that translates shell text.

```ts
(key, params?): string;
```

Translates shell text.

### Parameters

| Parameter | Type                                | Description     |
| --------- | ----------------------------------- | --------------- |
| `key`     | `string`                            | Text key.       |
| `params?` | `Record`&lt;`string`, `unknown`&gt; | ICU parameters. |

### Returns

`string`
