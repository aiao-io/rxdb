# cn()

```ts
function cn(...inputs): string;
```

Defined in: packages/rxdb-model/dist/cn.d.ts:18

Joins CSS class names (a thin wrapper around clsx).

Filters falsy values and supports conditional class names in object / array form, as a replacement for template string concatenation:
with template strings, the separating space before a conditional class name at the end of a line is eaten by formatters' trailing-whitespace
trimming, producing concatenation bugs like `flex-coloverflow-auto`; this function does not have that problem.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| ...`inputs` | `ClassValue`[] | String class names, conditional objects, or arrays; falsy values are ignored automatically |

## Returns

`string`

The class name string joined with single spaces

## Example

```ts
cn('tab-content flex-col', isForm ? 'overflow-auto p-4' : 'overflow-hidden')
// 'tab-content flex-col overflow-auto p-4'
```
