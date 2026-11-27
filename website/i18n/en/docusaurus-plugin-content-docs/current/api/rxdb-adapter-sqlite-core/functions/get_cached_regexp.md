# get_cached_regexp()

```ts
function get_cached_regexp(pattern, flags?): RegExp;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts#L123)

RegExp factory with an LRU-ish cache, reused by the SQLite `regexp` / `regexp_replace` custom functions.

The whole cache is cleared when its size exceeds 128 (a simple guard against memory growth); patterns over 1000 characters throw directly to prevent ReDoS.

## Parameters

| Parameter | Type     | Default value | Description                                       |
| --------- | -------- | ------------- | ------------------------------------------------- |
| `pattern` | `string` | `undefined`   | Regular expression source string                  |
| `flags?`  | `string` | `''`          | Regular expression flags, empty string by default |

## Returns

`RegExp`

The cached RegExp instance

## Throws

When the pattern length exceeds 1000
