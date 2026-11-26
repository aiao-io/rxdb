# sanitizeExtensions()

```ts
function sanitizeExtensions(record, extensions): Record<string, unknown>;
```

Defined in: [preferences/schema/extension.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/extension.ts#L109)

Sanitizes an open record: illegal values of registered extensions fall back to the default, unregistered keys are kept as-is, so an application that temporarily has no extension registered does not erase the settings the user already saved.

## Parameters

| Parameter    | Type                                                                     | Description                |
| ------------ | ------------------------------------------------------------------------ | -------------------------- |
| `record`     | `Record`&lt;`string`, `unknown`&gt;                                      | The record to sanitize.    |
| `extensions` | readonly [`PreferenceExtension`](../interfaces/PreferenceExtension.md)[] | The registered extensions. |

## Returns

`Record`&lt;`string`, `unknown`&gt;

The sanitized record.
