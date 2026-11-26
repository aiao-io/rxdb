# parseCheckConstraintViolation()

```ts
function parseCheckConstraintViolation(cause): 
  | {
  constraintName: string;
}
  | undefined;
```

Defined in: [packages/rxdb/src/system/check-violation.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/check-violation.ts#L45)

Parses the constraint name of a CHECK violation out of the raw database error.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cause` | `unknown` | The raw error thrown by the adapter |

## Returns

  \| \{
  `constraintName`: `string`;
\}
  \| `undefined`

The constraint name; `undefined` when it is not a CHECK violation
