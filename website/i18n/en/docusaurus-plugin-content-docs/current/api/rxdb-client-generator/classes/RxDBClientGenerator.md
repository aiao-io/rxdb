# RxDBClientGenerator

Defined in: [core/RxDBClientGenerator.ts:224](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L224)

RxDB Client generator

## Constructors

### Constructor

```ts
new RxDBClientGenerator(options?): RxDBClientGenerator;
```

Defined in: [core/RxDBClientGenerator.ts:246](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L246)

#### Parameters

| Parameter  | Type                                                                        |
| ---------- | --------------------------------------------------------------------------- |
| `options?` | [`RxDBClientGeneratorOptions`](../interfaces/RxDBClientGeneratorOptions.md) |

#### Returns

`RxDBClientGenerator`

## Properties

### config \{#config\}

```ts
config: Required<RxDBClientGeneratorOptions>;
```

Defined in: [core/RxDBClientGenerator.ts:241](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L241)

---

### entityMetadataOptionsMap \{#entitymetadataoptionsmap\}

```ts
entityMetadataOptionsMap: Map<string, EntityMetadataOptions[]>;
```

Defined in: [core/RxDBClientGenerator.ts:233](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L233)

---

### metadataMap \{#metadatamap\}

```ts
metadataMap: Map<string, Readonly<EntityMetadataType>>;
```

Defined in: [core/RxDBClientGenerator.ts:238](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L238)

---

### metadataOptionsSet \{#metadataoptionsset\}

```ts
metadataOptionsSet: Set<EntityMetadataOptions>;
```

Defined in: [core/RxDBClientGenerator.ts:236](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L236)

---

### metadataSet \{#metadataset\}

```ts
metadataSet: Set<Readonly<EntityMetadataType>>;
```

Defined in: [core/RxDBClientGenerator.ts:237](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L237)

---

### project \{#project\}

```ts
project: Project;
```

Defined in: [core/RxDBClientGenerator.ts:239](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L239)

## Methods

### addEntity() \{#addentity\}

```ts
addEntity(
   value,
   options?,
   sourceGetters?
): void;
```

Defined in: [core/RxDBClientGenerator.ts:276](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L276)

Adds an entity configuration or an entity class with metadata.

Entity names must be unique within this generator instance; duplicate entities or inputs that cannot produce a valid binding identifier throw immediately.

#### Parameters

| Parameter        | Type                                                                                                                                  | Default value | Description                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `value`          | \| [`EntityMetadataOptions`](../../rxdb/interfaces/EntityMetadataOptions.md) \| [`EntityType`](../../rxdb/type-aliases/EntityType.md) | `undefined`   | Entity metadata configuration, or an entity class decorated with `@Entity`                                              |
| `options?`       | [`EntityMetadataOptions`](../../rxdb/interfaces/EntityMetadataOptions.md)[]                                                           | `undefined`   | Inherited abstract metadata configuration; when omitted, resolved automatically from the first parent type in `extends` |
| `sourceGetters?` | readonly [`EntitySourceGetter`](../interfaces/EntitySourceGetter.md)[]                                                                | `[]`          | Getter definitions to append to the generated entity                                                                    |

#### Returns

`void`

#### Throws

Thrown when the entity name, properties, relations, or getters conflict with generated members

---

### exec() \{#exec\}

```ts
exec(): void;
```

Defined in: [core/RxDBClientGenerator.ts:403](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L403)

Runs the generator and creates the generated files in memory.

After the call completes, read the file text via [getSourceFiles](#getsourcefiles); this class never writes to the user's disk directly.
A failed run on the same instance does not replace the previous successful `project`.

#### Returns

`void`

#### Throws

Thrown when metadata or generated symbol validation fails

---

### generateEntityJsFile() \{#generateentityjsfile\}

```ts
generateEntityJsFile(): void;
```

Defined in: [core/RxDBClientGenerator.ts:431](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L431)

Generates the entity js file
Exposed for use in tests

#### Returns

`void`

---

### getMetadata() \{#getmetadata\}

```ts
getMetadata(mappedEntity, mappedNamespace?):
  | Readonly<EntityMetadataType>
  | undefined;
```

Defined in: [core/RxDBClientGenerator.ts:336](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L336)

Looks up registered metadata by entity name and namespace.

#### Parameters

| Parameter          | Type     | Description                                                                            |
| ------------------ | -------- | -------------------------------------------------------------------------------------- |
| `mappedEntity`     | `string` | Bound entity name                                                                      |
| `mappedNamespace?` | `string` | namespace; when omitted, [NAMESPACE\_PUBLIC](../variables/NAMESPACE_PUBLIC.md) is used |

#### Returns

\| `Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt;
\| `undefined`

The matching metadata; `undefined` when it does not exist

---

### getRepositoryGenerator() \{#getrepositorygenerator\}

```ts
getRepositoryGenerator(name):
  | IRepositoryGenerator
  | undefined;
```

Defined in: [core/RxDBClientGenerator.ts:391](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L391)

Gets a Repository generator

#### Parameters

| Parameter | Type     | Description     |
| --------- | -------- | --------------- |
| `name`    | `string` | Repository name |

#### Returns

\| [`IRepositoryGenerator`](../interfaces/IRepositoryGenerator.md)
\| `undefined`

The matching generator, or undefined if it does not exist

---

### getSourceFiles() \{#getsourcefiles\}

```ts
getSourceFiles(): SourceFile[];
```

Defined in: [core/RxDBClientGenerator.ts:423](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L423)

Gets the files created by the most recent successful generator run.

#### Returns

[`SourceFile`](../interfaces/SourceFile.md)[]

The set of generated files, including the `index` barrel and entity implementation/declaration files

#### Throws

Thrown when [exec](#exec) has not been called yet

---

### getSourceGetters() \{#getsourcegetters\}

```ts
getSourceGetters(metadata): readonly EntitySourceGetter[];
```

Defined in: [core/RxDBClientGenerator.ts:314](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L314)

Reads the getter definitions attached to an entity.

#### Parameters

| Parameter  | Type                                                          | Description                |
| ---------- | ------------------------------------------------------------- | -------------------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Registered entity metadata |

#### Returns

readonly [`EntitySourceGetter`](../interfaces/EntitySourceGetter.md)[]

A snapshot of the registered getters; an empty array when no getters are attached

---

### registerAbstractMetadata() \{#registerabstractmetadata\}

```ts
registerAbstractMetadata(abstractEntityName, metadataOptions): void;
```

Defined in: [core/RxDBClientGenerator.ts:346](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L346)

Registers abstract metadata that later entities can inherit.

#### Parameters

| Parameter            | Type                                                                        | Description                                                            |
| -------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `abstractEntityName` | `string`                                                                    | Bound name of the abstract entity                                      |
| `metadataOptions`    | [`EntityMetadataOptions`](../../rxdb/interfaces/EntityMetadataOptions.md)[] | Metadata options of the abstract entity, applied in parent-class order |

#### Returns

`void`

---

### registerRepositoryGenerator() \{#registerrepositorygenerator\}

```ts
registerRepositoryGenerator(generator): void;
```

Defined in: [core/RxDBClientGenerator.ts:374](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L374)

Registers a Repository generator
Used to extend support for custom Repository types

The generator's declared [IRepositoryGenerator.abstractEntityMetadata](../interfaces/IRepositoryGenerator.md#abstractentitymetadata) is registered as abstract metadata at the same time,
so callers do not have to repeat [registerAbstractMetadata](#registerabstractmetadata) by hand.

Duplicate names are always rejected, never silently replaced. The check must live here, not only in the CLI loading path
(`registerRepositoryGenerators` in `cli/repository-generators.ts`): programmatic callers that
`new RxDBClientGenerator()` and register manually (for example `generator.page.ts` in `apps/dev-rxdb-angular`) never reach the CLI layer, and a plugin with the same name as an already-registered generator (say another
`Repository`) would silently replace it, swapping the method set of entities using that name without any error.

#### Parameters

| Parameter   | Type                                                            | Description                   |
| ----------- | --------------------------------------------------------------- | ----------------------------- |
| `generator` | [`IRepositoryGenerator`](../interfaces/IRepositoryGenerator.md) | Repository generator instance |

#### Returns

`void`

#### Throws

Thrown when a generator with the same name already exists

#### Example

```typescript
const generator = new RxDBClientGenerator();
generator.registerRepositoryGenerator(new GeoRepositoryGenerator());
```

---

### setMetadata() \{#setmetadata\}

```ts
setMetadata(metadata): void;
```

Defined in: [core/RxDBClientGenerator.ts:325](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L325)

Registers metadata by `(namespace, name)`

Keys are always constructed by get\_cache\_key. Previously the write side concatenated by hand while the read side used
`get_cache_key`, and the two sides did not even agree on the namespace fallback (on the write side `undefined` would
become the literal `"undefined_Name"`) — no caller should concatenate keys itself anymore (RCG-001).

#### Parameters

| Parameter  | Type                                                          |
| ---------- | ------------------------------------------------------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) |

#### Returns

`void`
