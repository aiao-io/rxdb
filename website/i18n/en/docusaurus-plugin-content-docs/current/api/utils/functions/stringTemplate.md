# stringTemplate()

```ts
function stringTemplate(templateString, data): string;
```

Defined in: [packages/utils/src/string/stringTemplate.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/string/stringTemplate.ts#L16)

Replaces `${path}` placeholders in a template with object paths

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `templateString` | `string` | The template string |
| `data` | `unknown` | The template data |

## Returns

`string`

The string after substitution

## Remarks

The placeholder body uses `[^{}]+` rather than `[^}]+`: on templates without a closing brace, such as `'${'.repeat(20000)`, the latter scans from every `${` all the way to the end of the string before discovering there is no `}`, degrading to O(n²) (CS-009). The cost is that placeholders containing `{` are no longer recognized — `${` is the only opening delimiter and an object path cannot contain `{`, so such templates would only ever produce the default empty string anyway.
