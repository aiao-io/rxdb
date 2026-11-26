# sleep()

```ts
function sleep(ms): Promise<void>;
```

Defined in: [packages/utils/src/async/sleep.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/async/sleep.ts#L10)

Waits for the given number of milliseconds

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `ms` | `number` | Number of milliseconds to wait |

## Returns

`Promise`&lt;`void`&gt;

A Promise that resolves after the given time

## Example

```ts
// waits 1 second
await sleep(1000);
console.log('runs after 1 second');
```
