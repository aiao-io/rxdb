# debounce()

```ts
function debounce<Func>(func, waitMilliseconds?): (this, ...args) => void;
```

Defined in: [packages/utils/src/function/debounce.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/function/debounce.ts#L29)

Creates a debounced function that runs only after the given delay since the last call
Consecutive calls reset the timer; useful for frequently triggered events (scrolling, typing in an input)

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-func"></a> `Func` *extends* [`AnyFunction`](../type-aliases/AnyFunction.md) | The debounced function's type |

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `func` | `Func` | `undefined` | The function to debounce |
| `waitMilliseconds?` | `number` | `50` | Delay in milliseconds; defaults to 50ms |

## Returns

The debounced function

(`this`, ...`args`) => `void`

## Examples

```ts
// basic usage
const handleSearch = debounce((query: string) => {
  console.log('search:', query);
}, 300);
// called when the input changes
input.addEventListener('input', (e) => handleSearch(e.target.value));
```

```ts
// with a this context
const obj = {
  value: 10,
  getValue: debounce(function() {
    return this.value;
  })
};
**Note:** the debounced function ignores the original function's return value because it runs asynchronously via setTimeout
**Note:** consecutive calls reset the delay timer; it runs only after waitMilliseconds have passed since the last call
```
