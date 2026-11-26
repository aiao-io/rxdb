# stringSingleline()

```ts
function stringSingleline(value): string;
```

Defined in: [packages/utils/src/string/stringSingleline.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/string/stringSingleline.ts#L17)

Converts multi-line text to a single line, removing excess whitespace
Trims leading/trailing whitespace and replaces runs of whitespace with a single space

## Parameters

| Parameter | Type     | Description           |
| --------- | -------- | --------------------- |
| `value`   | `string` | The string to process |

## Returns

`string`

The processed single-line string

## Examples

```ts
stringSingleline('  hello   world  '); // returns 'hello world'
```

```ts
stringSingleline('line1\nline2\tline3'); // returns 'line1 line2 line3'
```

```ts
stringSingleline('multiple   spaces'); // returns 'multiple spaces'
```

```ts
stringSingleline(''); // returns ''
**Note:** trims leading/trailing whitespace with trim() first, then replaces runs of whitespace with a single space using the regex /\s+/g
**Note:** suitable for cleaning user input or formatting display text
```
