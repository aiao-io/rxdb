# themeDisplayName()

```ts
function themeDisplayName(name, translate): string;
```

Defined in: [theme/themes.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/theme/themes.ts#L109)

The theme's display name: light / dark / follow system go through translation; other theme names are proper nouns, split on hyphens and title-cased.

## Parameters

| Parameter   | Type                | Description                 |
| ----------- | ------------------- | --------------------------- |
| `name`      | `string`            | The theme name or `system`. |
| `translate` | (`key`) => `string` | The translation function.   |

## Returns

`string`

The display name.
