# startCase()

```ts
function startCase(value): string;
```

Defined in: [packages/utils/src/string/startCase.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/string/startCase.ts#L10)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `string` |

## Returns

`string`

## Example

```ts
startCase('--foo-bar'); // => 'Foo Bar'
startCase('fooBar'); // => 'Foo Bar'
startCase('__foo_bar__'); // => 'Foo Bar'
```
