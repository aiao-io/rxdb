# RepositoryGeneratorBase

Defined in: [generators/RepositoryGeneratorBase.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGeneratorBase.ts#L95)

Base Repository generator (abstract base class)
Provides shared utility methods; subclasses inherit it to generate their own Repository properties and methods

## Extended by

- [`RepositoryMethodsGenerator`](RepositoryMethodsGenerator.md)

## Implements

- [`IRepositoryGenerator`](../interfaces/IRepositoryGenerator.md)

## Constructors

### Constructor

```ts
new RepositoryGeneratorBase(): RepositoryGeneratorBase;
```

#### Returns

`RepositoryGeneratorBase`

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

#### Implementation of

[`IRepositoryGenerator`](../interfaces/IRepositoryGenerator.md).[`abstractEntityMetadata`](../interfaces/IRepositoryGenerator.md#abstractentitymetadata)

---

### entityBaseModuleSpecifier? \{#entitybasemodulespecifier\}

```ts
readonly entityBaseModuleSpecifier?: string;
```

Defined in: [generators/RepositoryGeneratorBase.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGeneratorBase.ts#L99)

Source module of the entity runtime base classes; @aiao/rxdb is used when unset.

#### Implementation of

[`IRepositoryGenerator`](../interfaces/IRepositoryGenerator.md).[`entityBaseModuleSpecifier`](../interfaces/IRepositoryGenerator.md#entitybasemodulespecifier)

---

### name \{#name\}

```ts
abstract readonly name: string;
```

Defined in: [generators/RepositoryGeneratorBase.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGeneratorBase.ts#L96)

Generator name
Must match the EntityMetadata.repository field

#### Example

```ts
('Repository', 'TreeRepository', 'GraphRepository', 'GeoRepository');
```

#### Implementation of

[`IRepositoryGenerator`](../interfaces/IRepositoryGenerator.md).[`name`](../interfaces/IRepositoryGenerator.md#name)

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

---

### addTypeImport() \{#addtypeimport\}

```ts
protected addTypeImport(context, name): void;
```

Defined in: [generators/RepositoryGeneratorBase.ts:141](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGeneratorBase.ts#L141)

Registers a type import, routed by this generator's [entityBaseModuleSpecifier](#entitybasemodulespecifier).

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

#### Implementation of

[`IRepositoryGenerator`](../interfaces/IRepositoryGenerator.md).[`generate`](../interfaces/IRepositoryGenerator.md#generate)

---

### generateMethods() \{#generatemethods\}

```ts
abstract protected generateMethods(context): void;
```

Defined in: [generators/RepositoryGeneratorBase.ts:132](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGeneratorBase.ts#L132)

Subclass implementation: generates the concrete Repository methods

#### Parameters

| Parameter | Type                                                    |
| --------- | ------------------------------------------------------- |
| `context` | [`GeneratorContext`](../interfaces/GeneratorContext.md) |

#### Returns

`void`

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
