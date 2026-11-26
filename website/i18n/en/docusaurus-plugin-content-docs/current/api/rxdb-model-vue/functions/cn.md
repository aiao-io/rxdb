# cn()

```ts
function cn(...inputs): string;
```

Defined in: packages/rxdb-model/dist/cn.d.ts:18

Concatenates CSS class names (a thin wrapper over clsx).

Filters out falsy values and supports conditional class names in object / array form, replacing template-string concatenation:
when the separating space before a conditional class name sits at the end of a line in a template string, formatters' trailing-whitespace
trimming eats it, producing concatenation bugs like `flex-coloverflow-auto`; this function does not have that problem.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| ...`inputs` | `ClassValue`[] | String class names, conditional objects or arrays; falsy values are ignored automatically |

## Returns

`string`

The class name string joined with single spaces

## Example

```ts
cn('tab-content flex-col', isForm ? 'overflow-auto p-4' : 'overflow-hidden')
// 'tab-content flex-col overflow-auto p-4'
```
