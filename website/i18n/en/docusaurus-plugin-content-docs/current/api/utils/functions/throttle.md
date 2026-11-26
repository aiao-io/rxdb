# throttle()

```ts
function throttle<Func>(func, timeFrame): (this, ...args) => void;
```

Defined in: [packages/utils/src/function/throttle.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/function/throttle.ts#L32)

Creates a throttled function that runs at most once per interval
Unlike debounce, throttle executes periodically rather than waiting for the last call; useful for limiting the rate of high-frequency events (scrolling, resizing)

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-func"></a> `Func` *extends* [`AnyFunction`](../type-aliases/AnyFunction.md) | The throttled function's type |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `func` | `Func` | The function to throttle |
| `timeFrame` | `number` | Interval in milliseconds; the function runs at most once within it |

## Returns

The throttled function

(`this`, ...`args`) => `void`

## Examples

```ts
// basic usage
const handleScroll = throttle(() => {
  console.log('scroll position:', window.scrollY);
}, 100);
window.addEventListener('scroll', handleScroll);
```

```ts
// with arguments and this context
const logger = {
  prefix: 'Log:',
  log: throttle(function(message: string) {
    console.log(this.prefix, message);
  }, 200)
};
logger.log('Hello');
logger.log('World'); // executes only once within 200ms
**Note:** the throttled function ignores calls within the interval; they do not accumulate
**Note:** the first call executes immediately; later calls are limited by the interval
**Note:** synchronous re-entrant calls during execution are also throttled; a synchronous throw does not consume the time window, so the next call runs normally
**Warning:** make sure timeFrame is a positive integer, otherwise unexpected behavior may occur
```
