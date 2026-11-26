# RootBinding

Defined in: [shell/root-binding.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/root-binding.ts#L34)

A binding that incrementally writes root element attributes and styles.

## Methods

### apply() \{#apply\}

```ts
apply(attributes, style): void;
```

Defined in: [shell/root-binding.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/root-binding.ts#L40)

Writes attributes and styles; anything written before but absent this time is removed.

#### Parameters

| Parameter    | Type                                                 | Description                                                    |
| ------------ | ---------------------------------------------------- | -------------------------------------------------------------- |
| `attributes` | `Readonly`&lt;`Record`&lt;`string`, `string`&gt;&gt; | The attributes.                                                |
| `style`      | `Readonly`&lt;`Record`&lt;`string`, `string`&gt;&gt; | The styles (custom properties or ordinary CSS property names). |

#### Returns

`void`

---

### clear() \{#clear\}

```ts
clear(): void;
```

Defined in: [shell/root-binding.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/root-binding.ts#L42)

Removes all attributes and styles written so far.

#### Returns

`void`
