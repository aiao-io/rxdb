# CodeEditorLanguageDescription

Defined in: [languages.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/languages.ts#L16)

## Properties

### alias \{#alias\}

```ts
readonly alias: readonly string[];
```

Defined in: [languages.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/languages.ts#L18)

---

### extensions \{#extensions\}

```ts
readonly extensions: readonly string[];
```

Defined in: [languages.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/languages.ts#L19)

---

### filename \{#filename\}

```ts
readonly filename: RegExp | undefined;
```

Defined in: [languages.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/languages.ts#L20)

---

### name \{#name\}

```ts
readonly name: string;
```

Defined in: [languages.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/languages.ts#L17)

---

### support \{#support\}

```ts
readonly support: CodeEditorLanguageSupport | undefined;
```

Defined in: [languages.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/languages.ts#L21)

## Methods

### load() \{#load\}

```ts
load(): Promise<CodeEditorLanguageSupport>;
```

Defined in: [languages.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/languages.ts#L22)

#### Returns

`Promise`&lt;[`CodeEditorLanguageSupport`](CodeEditorLanguageSupport.md)&gt;
