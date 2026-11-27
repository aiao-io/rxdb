# entityDefaultNow()

```ts
function entityDefaultNow(): Date;
```

Defined in: [packages/rxdb/src/entity/entity.utils.ts:152](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.utils.ts#L152)

The "now" inside a default value function.

## Returns

`Date`

The moment of the current fill, or the moment of the call.

## Remarks

All defaults that call it within the same default fill get **the same moment**: if `createdAt` and `updatedAt` each called `new Date()`, the two calls could cross a millisecond boundary and the two timestamps of a new row would differ by 1ms, randomly breaking the invariant "`updatedAt === createdAt` means never modified".

Each call returns a **new** `Date` instance (a copy, not a shared reference), so the two fields can never alias each other. Calling it outside a fill is just the ordinary current time — there is no shareable moment scope anyway.

Nested fills each hold their own moment (see fillInstant): the inner instance is **another row**, and its "created at" should not be retroactively stamped with the outer moment. After the inner fill ends, the outer one resumes filling with its own moment.

## Example

```ts
{ name: 'createdAt', type: PropertyType.date, default: () => entityDefaultNow() }
```
