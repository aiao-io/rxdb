# SourceFile

Defined in: [core/ts-morph-browser.ts:251](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/ts-morph-browser.ts#L251)

Lightweight source file interface used by the generator.

This interface only maintains in-memory TypeScript structures and text and never touches a real filesystem; disk commits in the CLI are handled by the
builder. Read the content with [getText](#gettext); `save`/`saveSync` are kept for compatibility with ts-morph callers,
but they explicitly throw an error stating that the filesystem is not supported.

## Methods

### addClass() \{#addclass\}

```ts
addClass(structure): ClassDeclaration;
```

Defined in: [core/ts-morph-browser.ts:252](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/ts-morph-browser.ts#L252)

#### Parameters

| Parameter   | Type                        |
| ----------- | --------------------------- |
| `structure` | `ClassDeclarationStructure` |

#### Returns

`ClassDeclaration`

---

### addEnum() \{#addenum\}

```ts
addEnum(structure): EnumDeclarationStructure;
```

Defined in: [core/ts-morph-browser.ts:256](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/ts-morph-browser.ts#L256)

#### Parameters

| Parameter   | Type                       |
| ----------- | -------------------------- |
| `structure` | `EnumDeclarationStructure` |

#### Returns

`EnumDeclarationStructure`

---

### addExportDeclaration() \{#addexportdeclaration\}

```ts
addExportDeclaration(structure): void;
```

Defined in: [core/ts-morph-browser.ts:258](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/ts-morph-browser.ts#L258)

#### Parameters

| Parameter   | Type                         |
| ----------- | ---------------------------- |
| `structure` | `ExportDeclarationStructure` |

#### Returns

`void`

---

### addImportDeclaration() \{#addimportdeclaration\}

```ts
addImportDeclaration(structure): void;
```

Defined in: [core/ts-morph-browser.ts:257](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/ts-morph-browser.ts#L257)

#### Parameters

| Parameter   | Type                         |
| ----------- | ---------------------------- |
| `structure` | `ImportDeclarationStructure` |

#### Returns

`void`

---

### addInterface() \{#addinterface\}

```ts
addInterface(structure): AddedInterface;
```

Defined in: [core/ts-morph-browser.ts:253](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/ts-morph-browser.ts#L253)

#### Parameters

| Parameter   | Type                            |
| ----------- | ------------------------------- |
| `structure` | `InterfaceDeclarationStructure` |

#### Returns

`AddedInterface`

---

### addModule() \{#addmodule\}

```ts
addModule(structure): AddedModule;
```

Defined in: [core/ts-morph-browser.ts:254](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/ts-morph-browser.ts#L254)

#### Parameters

| Parameter   | Type                         |
| ----------- | ---------------------------- |
| `structure` | `ModuleDeclarationStructure` |

#### Returns

`AddedModule`

---

### addTypeAlias() \{#addtypealias\}

```ts
addTypeAlias(structure): TypeAliasDeclarationStructure;
```

Defined in: [core/ts-morph-browser.ts:255](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/ts-morph-browser.ts#L255)

#### Parameters

| Parameter   | Type                            |
| ----------- | ------------------------------- |
| `structure` | `TypeAliasDeclarationStructure` |

#### Returns

`TypeAliasDeclarationStructure`

---

### addVariableStatement() \{#addvariablestatement\}

```ts
addVariableStatement(structure): void;
```

Defined in: [core/ts-morph-browser.ts:259](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/ts-morph-browser.ts#L259)

#### Parameters

| Parameter   | Type                         |
| ----------- | ---------------------------- |
| `structure` | `VariableStatementStructure` |

#### Returns

`void`

---

### getClasses() \{#getclasses\}

```ts
getClasses(): ClassDeclaration[];
```

Defined in: [core/ts-morph-browser.ts:260](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/ts-morph-browser.ts#L260)

#### Returns

`ClassDeclaration`[]

---

### getFilePath() \{#getfilepath\}

```ts
getFilePath(): string;
```

Defined in: [core/ts-morph-browser.ts:261](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/ts-morph-browser.ts#L261)

#### Returns

`string`

---

### getText() \{#gettext\}

```ts
getText(): string;
```

Defined in: [core/ts-morph-browser.ts:262](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/ts-morph-browser.ts#L262)

#### Returns

`string`

---

### save() \{#save\}

```ts
save(): Promise<void>;
```

Defined in: [core/ts-morph-browser.ts:268](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/ts-morph-browser.ts#L268)

Async compatibility entry point.

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

Always throws; the in-memory generator provides no filesystem writes

---

### saveSync() \{#savesync\}

```ts
saveSync(): void;
```

Defined in: [core/ts-morph-browser.ts:273](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/ts-morph-browser.ts#L273)

Sync compatibility entry point.

#### Returns

`void`

#### Throws

Always throws; the in-memory generator provides no filesystem writes

---

### setContent() \{#setcontent\}

```ts
setContent(content): void;
```

Defined in: [core/ts-morph-browser.ts:263](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/ts-morph-browser.ts#L263)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `content` | `string` |

#### Returns

`void`
