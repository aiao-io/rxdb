# once()

```ts
function once<F>(func): F;
```

Defined in: [packages/utils/src/function/once.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/function/once.ts#L29)

Creates a function that runs only once; later calls return the result of the first call
Suitable for initialization functions, resource loading, and other run-once scenarios

## Type Parameters

| Type Parameter                                              | Description                                                 |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| <a id="type-parameter-f"></a> `F` _extends_ () => `unknown` | The wrapped function type; must be a zero-argument function |

## Parameters

| Parameter | Type | Description                                    |
| --------- | ---- | ---------------------------------------------- |
| `func`    | `F`  | The function to restrict to a single execution |

## Returns

`F`

The wrapped function, with the same type as the original

## Examples

```ts
// basic usage
const initialize = once(() => {
  console.log('initializing');
  return 'done';
});
initialize(); // logs 'initializing' and returns 'done'
initialize(); // returns 'done' directly without running the body
```

```ts
// a scenario with a return value
const getConfig = once(() => {
  return fetch('/config').then(res => res.json());
});
// multiple calls trigger only one request
getConfig();
getConfig();
**Note:** this implementation supports zero-argument functions only; for functions with arguments use another implementation
**Note:** the result of the first execution is cached; later calls return the same result
**Note:** re-entering synchronously while the function is executing does not run it again; the re-entrant call returns `undefined` (the result does not exist yet);
a synchronous throw is not cached; the next call executes again
```
