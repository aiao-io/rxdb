# isRedactedErrorMessage()

```ts
function isRedactedErrorMessage(value): value is string;
```

Defined in: [v2/errors.ts:132](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/errors.ts#L132)

Checks whether a value is an error description that meets the redaction requirements.

## Parameters

| Parameter | Type      | Description         |
| --------- | --------- | ------------------- |
| `value`   | `unknown` | The value to check. |

## Returns

`value is string`

`true` when the value is non-empty, single-line, contains no absolute path, and is not overly long.

## Remarks

This is the last **mechanical** line of defense, not a sufficient condition: it cannot stop leaks like "writing SQL as one line", but it blocks the two most common kinds in practice — passing through `error.stack` directly (multi-line) and passing through absolute paths from platform exceptions. The real guarantee comes from `error-mapping` only emitting static text and never concatenating platform text.
