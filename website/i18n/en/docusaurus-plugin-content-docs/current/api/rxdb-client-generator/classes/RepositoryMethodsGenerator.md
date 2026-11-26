# RepositoryMethodsGenerator

Defined in: [generators/RepositoryGeneratorBase.ts:279](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGeneratorBase.ts#L279)

Repository generator
Generates common CRUD properties and methods for all entities: get, find, findOne, save, remove, and so on

## Extends

- [`RepositoryGeneratorBase`](RepositoryGeneratorBase.md)

## Constructors

### Constructor

```ts
new RepositoryMethodsGenerator(): RepositoryMethodsGenerator;
```

#### Returns

`RepositoryMethodsGenerator`

#### Inherited from

[`RepositoryGeneratorBase`](RepositoryGeneratorBase.md).[`constructor`](RepositoryGeneratorBase.md#constructor)

## Properties

### abstractEntityMetadata? \{#abstractentitymetadata\}

```ts
readonly abstractEntityMetadata?: ReadonlyMap<string, EntityMetadataOptions[]>;
```

Defined in: [generators/RepositoryGeneratorBase.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGeneratorBase.ts#L102)

Metadata of the abstract entity base classes this generator is responsible for, keyed by base class name, with values ordered "self → ancestors".

#### Remarks

The decorator argument of an abstract base class is usually a constant identifier (`@Entity(GRAPH_ENTITY_BASE_OPTIONS)`),
which the CLI's static evaluation cannot resolve; yet the base class metadata must be in place while entity sources are analyzed, otherwise
an entity with `extends GraphEntityBase` immediately reports "cannot be statically evaluated".

Once the generator carries this data along, the analyzer backfills it from the package name pointed to by [entityBaseModuleSpecifier](../interfaces/IRepositoryGenerator.md#entitybasemodulespecifier)
plus the base class name — the generator package therefore does not need to reverse-depend on that plugin for every plugin base class.
A generator that declares only this field but no [entityBaseModuleSpecifier](../interfaces/IRepositoryGenerator.md#entitybasemodulespecifier) is not adopted by the analyzer:
without the package name matching can only be done by class name, and a user-written class with the same name would be replaced.

#### Inherited from

[`RepositoryGeneratorBase`](RepositoryGeneratorBase.md).[`abstractEntityMetadata`](RepositoryGeneratorBase.md#abstractentitymetadata)

---

### entityBaseModuleSpecifier? \{#entitybasemodulespecifier\}

```ts
readonly entityBaseModuleSpecifier?: string;
```

Defined in: [generators/RepositoryGeneratorBase.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGeneratorBase.ts#L99)

Source module of the entity runtime base classes; @aiao/rxdb is used when unset.

#### Inherited from

[`RepositoryGeneratorBase`](RepositoryGeneratorBase.md).[`entityBaseModuleSpecifier`](RepositoryGeneratorBase.md#entitybasemodulespecifier)

---

### name \{#name\}

```ts
readonly name: string = 'Repository';
```

Defined in: [generators/RepositoryGeneratorBase.ts:280](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGeneratorBase.ts#L280)

Generator name
Must match the EntityMetadata.repository field

#### Example

```ts
('Repository', 'TreeRepository', 'GraphRepository', 'GeoRepository');
```

#### Overrides

[`RepositoryGeneratorBase`](RepositoryGeneratorBase.md).[`name`](RepositoryGeneratorBase.md#name)

## Methods

### addInstanceMethod() \{#addinstancemethod\}

```ts
protected addInstanceMethod(context, config): void;
```

Defined in: [generators/RepositoryGeneratorBase.ts:234](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGeneratorBase.ts#L234)

Shared utility: adds an instance method

#### Parameters

| Parameter           | Type                                                                |
| ------------------- | ------------------------------------------------------------------- |
| `context`           | [`GeneratorContext`](../interfaces/GeneratorContext.md)             |
| `config`            | \{ `docs`: `string`[]; `name`: `string`; `returnType`: `string`; \} |
| `config.docs`       | `string`[]                                                          |
| `config.name`       | `string`                                                            |
| `config.returnType` | `string`                                                            |

#### Returns

`void`

#### Inherited from

[`RepositoryGeneratorBase`](RepositoryGeneratorBase.md).[`addInstanceMethod`](RepositoryGeneratorBase.md#addinstancemethod)

---

### addInstanceProperty() \{#addinstanceproperty\}

```ts
protected addInstanceProperty(context, config): void;
```

Defined in: [generators/RepositoryGeneratorBase.ts:252](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGeneratorBase.ts#L252)

Shared utility: adds an instance function property

#### Parameters

| Parameter     | Type                                                          |
| ------------- | ------------------------------------------------------------- |
| `context`     | [`GeneratorContext`](../interfaces/GeneratorContext.md)       |
| `config`      | \{ `docs`: `string`[]; `name`: `string`; `type`: `string`; \} |
| `config.docs` | `string`[]                                                    |
| `config.name` | `string`                                                      |
| `config.type` | `string`                                                      |

#### Returns

`void`

#### Inherited from

[`RepositoryGeneratorBase`](RepositoryGeneratorBase.md).[`addInstanceProperty`](RepositoryGeneratorBase.md#addinstanceproperty)

---

### addStaticMethod() \{#addstaticmethod\}

```ts
protected addStaticMethod(context, config): void;
```

Defined in: [generators/RepositoryGeneratorBase.ts:153](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGeneratorBase.ts#L153)

Shared utility: adds a static query method

#### Parameters

| Parameter                             | Type                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `context`                             | [`GeneratorContext`](../interfaces/GeneratorContext.md)                                                                                                                                                                                                                                                                                                         |
| `config`                              | \{ `baseSignature?`: \{ `entityBase`: `string`; `options`: `string`; `parameterName?`: `string`; `returnType`: `string`; \}; `example?`: `string`; `method`: `string`; `metHodDoc?`: `string`; `options`: `string`; `optionsIsRequired?`: `boolean`; `registerOptions?`: `boolean`; `resultWrapper?`: `"Observable"` \| `"Promise"`; `returnType`: `string`; \} |
| `config.baseSignature?`               | \{ `entityBase`: `string`; `options`: `string`; `parameterName?`: `string`; `returnType`: `string`; \}                                                                                                                                                                                                                                                          |
| `config.baseSignature.entityBase`     | `string`                                                                                                                                                                                                                                                                                                                                                        |
| `config.baseSignature.options`        | `string`                                                                                                                                                                                                                                                                                                                                                        |
| `config.baseSignature.parameterName?` | `string`                                                                                                                                                                                                                                                                                                                                                        |
| `config.baseSignature.returnType`     | `string`                                                                                                                                                                                                                                                                                                                                                        |
| `config.example?`                     | `string`                                                                                                                                                                                                                                                                                                                                                        |
| `config.method`                       | `string`                                                                                                                                                                                                                                                                                                                                                        |
| `config.metHodDoc?`                   | `string`                                                                                                                                                                                                                                                                                                                                                        |
| `config.options`                      | `string`                                                                                                                                                                                                                                                                                                                                                        |
| `config.optionsIsRequired?`           | `boolean`                                                                                                                                                                                                                                                                                                                                                       |
| `config.registerOptions?`             | `boolean`                                                                                                                                                                                                                                                                                                                                                       |
| `config.resultWrapper?`               | `"Observable"` \| `"Promise"`                                                                                                                                                                                                                                                                                                                                   |
| `config.returnType`                   | `string`                                                                                                                                                                                                                                                                                                                                                        |

#### Returns

`void`

#### Inherited from

[`RepositoryGeneratorBase`](RepositoryGeneratorBase.md).[`addStaticMethod`](RepositoryGeneratorBase.md#addstaticmethod)

---

### addTypeImport() \{#addtypeimport\}

```ts
protected addTypeImport(context, name): void;
```

Defined in: [generators/RepositoryGeneratorBase.ts:141](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGeneratorBase.ts#L141)

Registers a type import, routed by this generator's [entityBaseModuleSpecifier](RepositoryGeneratorBase.md#entitybasemodulespecifier).

#### Parameters

| Parameter | Type                                                    |
| --------- | ------------------------------------------------------- |
| `context` | [`GeneratorContext`](../interfaces/GeneratorContext.md) |
| `name`    | `string`                                                |

#### Returns

`void`

#### Remarks

The base class of tree entities and its companion option types (`TreeAdjacencyListEntityBase` / `FindTreeOptions`) live in
`@aiao/rxdb-plugin-tree`; generators without a declared specifier always fall back to `@aiao/rxdb`.

#### Inherited from

[`RepositoryGeneratorBase`](RepositoryGeneratorBase.md).[`addTypeImport`](RepositoryGeneratorBase.md#addtypeimport)

---

### declareSymbols() \{#declaresymbols\}

```ts
declareSymbols(metadata): RepositoryGeneratorSymbols;
```

Defined in: [generators/RepositoryGeneratorBase.ts:283](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGeneratorBase.ts#L283)

#### Parameters

| Parameter  | Type                                                          |
| ---------- | ------------------------------------------------------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) |

#### Returns

[`RepositoryGeneratorSymbols`](../interfaces/RepositoryGeneratorSymbols.md)

#### Inherit Doc

---

### generate() \{#generate\}

```ts
generate(context): void;
```

Defined in: [generators/RepositoryGeneratorBase.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGeneratorBase.ts#L104)

Generates the properties and methods specific to the Repository

#### Parameters

| Parameter | Type                                                    | Description        |
| --------- | ------------------------------------------------------- | ------------------ |
| `context` | [`GeneratorContext`](../interfaces/GeneratorContext.md) | Generation context |

#### Returns

`void`

#### Inherited from

[`RepositoryGeneratorBase`](RepositoryGeneratorBase.md).[`generate`](RepositoryGeneratorBase.md#generate)

---

### generateMethods() \{#generatemethods\}

```ts
protected generateMethods(context): void;
```

Defined in: [generators/RepositoryGeneratorBase.ts:294](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGeneratorBase.ts#L294)

Subclass implementation: generates the concrete Repository methods

#### Parameters

| Parameter | Type                                                    |
| --------- | ------------------------------------------------------- |
| `context` | [`GeneratorContext`](../interfaces/GeneratorContext.md) |

#### Returns

`void`

#### Overrides

[`RepositoryGeneratorBase`](RepositoryGeneratorBase.md).[`generateMethods`](RepositoryGeneratorBase.md#generatemethods)

---

### generateProperties() \{#generateproperties\}

```ts
protected generateProperties(context): void;
```

Defined in: [generators/RepositoryGeneratorBase.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGeneratorBase.ts#L125)

Generator hook: generates Repository-specific properties
Subclasses may optionally override this method to generate specific computed properties, indexes, and so on

#### Parameters

| Parameter | Type                                                    |
| --------- | ------------------------------------------------------- |
| `context` | [`GeneratorContext`](../interfaces/GeneratorContext.md) |

#### Returns

`void`

#### Example

```typescript
// A Tree Generator may need to generate tree-level cache properties
protected generateProperties(context: GeneratorContext): void {
  context.classProperties.push({
    name: 'maxDepth',
    type: 'number',
    isReadonly: true
  });
}
```

#### Inherited from

[`RepositoryGeneratorBase`](RepositoryGeneratorBase.md).[`generateProperties`](RepositoryGeneratorBase.md#generateproperties)

---

### getIdType() \{#getidtype\}

```ts
protected getIdType(metadata): IdType;
```

Defined in: [generators/RepositoryGeneratorBase.ts:270](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGeneratorBase.ts#L270)

Shared utility: gets the ID type

#### Parameters

| Parameter  | Type                                                                                  |
| ---------- | ------------------------------------------------------------------------------------- |
| `metadata` | `Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt; |

#### Returns

`IdType`

#### Inherited from

[`RepositoryGeneratorBase`](RepositoryGeneratorBase.md).[`getIdType`](RepositoryGeneratorBase.md#getidtype)
