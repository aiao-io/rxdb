# useAdminText()

```ts
function useAdminText(): (key, params?) => string;
```

Defined in: [context.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-vue/src/context.ts#L38)

Translation function; the template re-renders when the language or catalog changes: every call reads the copy revision, so render effects depend on it.

## Returns

The function that translates shell copy.

```ts
(key, params?): string;
```

Translates shell copy.

### Parameters

| Parameter | Type                                | Description     |
| --------- | ----------------------------------- | --------------- |
| `key`     | `string`                            | The copy key.   |
| `params?` | `Record`&lt;`string`, `unknown`&gt; | ICU parameters. |

### Returns

`string`
