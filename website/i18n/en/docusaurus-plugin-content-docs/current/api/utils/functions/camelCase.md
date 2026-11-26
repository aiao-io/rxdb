# camelCase()

```ts
function camelCase(str): string;
```

Defined in: [packages/utils/src/string/camelCase.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/string/camelCase.ts#L25)

Converts a string to camelCase
CamelCase rules: the first letter is lowercased, the first letter of each subsequent word is capitalized, with no separator between words
Handles strings containing hyphens (-), underscores (_), spaces, or mixed case

## Parameters

| Parameter | Type     | Description                                                |
| --------- | -------- | ---------------------------------------------------------- |
| `str`     | `string` | Input string; may contain various separators or mixed case |

## Returns

`string`

The converted camelCase string

## Examples

```ts
camelCase('hello-world'); // returns 'helloWorld'
```

```ts
camelCase('Hello_World'); // returns 'helloWorld'
```

```ts
camelCase('hello world'); // returns 'helloWorld'
```

```ts
camelCase('HelloWorld'); // returns 'helloWorld'
```

```ts
camelCase('  hello--world  '); // returns 'helloWorld' (leading/trailing whitespace removed)
```

```ts
camelCase('');                 // returns '' (an empty input returns an empty string)
**Note:** internally uses getWords() to split words and capitalize() to capitalize the first letter of each word
```
