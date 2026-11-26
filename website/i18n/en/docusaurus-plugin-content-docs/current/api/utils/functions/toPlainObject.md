# toPlainObject()

```ts
function toPlainObject(value): Record<string, unknown>;
```

Defined in: [packages/utils/src/object/toPlainObject.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/object/toPlainObject.ts#L9)

Converts a value to a plain object containing only own enumerable properties

**Note:** every key is written as an own property; a `__proto__` key does not change the prototype of the result

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | The value to convert |

## Returns

`Record`&lt;`string`, `unknown`&gt;

A shallow copy as a plain object
