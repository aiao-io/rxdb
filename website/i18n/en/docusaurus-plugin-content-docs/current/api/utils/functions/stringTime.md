# stringTime()

```ts
function stringTime(
   key, 
   value, 
   config?
): string;
```

Defined in: [packages/utils/src/date/stringTime.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/date/stringTime.ts#L16)

Formats a time value into a string with a unit

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | keyof `ParseTime` | The time unit key, corresponding to a property of the ParseTime interface |
| `value` | `number` | The time value |
| `config?` | `ParseTimeConfig` | An optional configuration object for customizing unit names |

## Returns

`string`

The formatted time string, e.g. "5 day" or "3 hours"

## Example

```ts
stringTime('day', 5); // returns "5 day"
stringTime('hour', 3, { hour: 'hrs' }); // returns "3 hrs"
**Note:** if config is provided, the unit names from config are used; otherwise the English key names are used
**Note:** this function is mainly used internally by functions such as formatPassTime
```
