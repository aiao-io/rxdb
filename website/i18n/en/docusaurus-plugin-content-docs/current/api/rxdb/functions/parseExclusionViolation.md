# parseExclusionViolation()

```ts
function parseExclusionViolation(cause): ParsedExclusionViolation | undefined;
```

Defined in: [packages/rxdb/src/system/exclusion-violation.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/exclusion-violation.ts#L97)

Parses a range exclusion violation out of a raw database error.

## Parameters

| Parameter | Type      | Description                         |
| --------- | --------- | ----------------------------------- |
| `cause`   | `unknown` | The raw error thrown by the adapter |

## Returns

\| [`ParsedExclusionViolation`](../interfaces/ParsedExclusionViolation.md)
\| `undefined`

The constraint name and the raw conflicting keys; `undefined` when it is not a range exclusion violation.
