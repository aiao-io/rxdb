# cn()

```ts
function cn(...inputs): string;
```

Defined in: [packages/rxdb-model/src/cn.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/cn.ts#L19)

Concatenates CSS class names (a thin wrapper over clsx).

Filters falsy values and supports conditional class names in object / array form, replacing template string concatenation:
in a template string, when the separating space before a conditional class name sits at the end of a line, formatters' trailing-whitespace
trimming eats it, producing concatenation bugs like `flex-coloverflow-auto`; this function does not have that problem.

## Parameters

| Parameter   | Type           | Description                                                                                |
| ----------- | -------------- | ------------------------------------------------------------------------------------------ |
| ...`inputs` | `ClassValue`[] | String class names, conditional objects, or arrays; falsy values are ignored automatically |

## Returns

`string`

The class name string joined with single spaces

## Example

```ts
cn('tab-content flex-col', isForm ? 'overflow-auto p-4' : 'overflow-hidden');
// 'tab-content flex-col overflow-auto p-4'
```
