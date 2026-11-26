# useAdminText()

```ts
function useAdminText(): (key, params?) => string;
```

Defined in: [context.tsx:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-react/src/context.tsx#L62)

Translation function; re-renders when the language or catalog changes.

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
