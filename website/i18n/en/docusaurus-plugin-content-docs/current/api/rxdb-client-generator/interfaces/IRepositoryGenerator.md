# IRepositoryGenerator

Defined in: [generators/RepositoryGenerator.interface.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGenerator.interface.ts#L125)

Repository generator interface

Used to generate specific properties, type definitions, and static method signatures for different Repository types
Follows the open/closed principle: open for extension, closed for modification

## Remarks

The generator uses two-phase generation:

1. **generateProperties()**: generates Repository-specific computed properties, cache properties, and so on (optional)
2. **generateMethods()**: generates Repository-specific query methods (required)

The base class [RepositoryMethodsGenerator](../classes/RepositoryMethodsGenerator.md) provides the generateProperties() hook,
which subclasses may optionally override.

## Example

```typescript
// Implement a custom GeoRepository generator
export class GeoRepositoryGenerator extends RepositoryMethodsGenerator {
  readonly name = 'GeoRepository';

  // [Optional] generate Geo-specific properties
  protected generateProperties(context: GeneratorContext): void {
    context.classProperties.push({
      name: 'spatialIndex',
      type: 'SpatialIndex',
      isReadonly: true,
      docs: ['Spatial index instance, used for geographic location queries']
    });
  }

  // [Required] generate Geo-specific methods
  protected generateMethods(context: GeneratorContext): void {
    this.addStaticMethod(context, {
      method: 'findNearby',
      options: 'FindNearbyOptions<typeof Entity>',
      returnType: 'Entity[]',
      metHodDoc: 'Queries nearby entities'
    });
  }
}

// Register with the generator
const generator = new RxDBClientGenerator();
generator.registerRepositoryGenerator(new GeoRepositoryGenerator());
```

## Properties

### abstractEntityMetadata? \{#abstractentitymetadata\}

```ts
readonly abstractEntityMetadata?: ReadonlyMap<string, EntityMetadataOptions[]>;
```

Defined in: [generators/RepositoryGenerator.interface.ts:149](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGenerator.interface.ts#L149)

Metadata of the abstract entity base classes this generator is responsible for, keyed by base class name, with values ordered "self → ancestors".

#### Remarks

The decorator argument of an abstract base class is usually a constant identifier (`@Entity(GRAPH_ENTITY_BASE_OPTIONS)`),
which the CLI's static evaluation cannot resolve; yet the base class metadata must be in place while entity sources are analyzed, otherwise
an entity with `extends GraphEntityBase` immediately reports "cannot be statically evaluated".

Once the generator carries this data along, the analyzer backfills it from the package name pointed to by [entityBaseModuleSpecifier](#entitybasemodulespecifier)
plus the base class name — the generator package therefore does not need to reverse-depend on that plugin for every plugin base class.
A generator that declares only this field but no [entityBaseModuleSpecifier](#entitybasemodulespecifier) is not adopted by the analyzer:
without the package name matching can only be done by class name, and a user-written class with the same name would be replaced.

---

### entityBaseModuleSpecifier? \{#entitybasemodulespecifier\}

```ts
readonly entityBaseModuleSpecifier?: string;
```

Defined in: [generators/RepositoryGenerator.interface.ts:134](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGenerator.interface.ts#L134)

Source module of the entity runtime base classes; @aiao/rxdb is used when unset.

---

### name \{#name\}

```ts
readonly name: string;
```

Defined in: [generators/RepositoryGenerator.interface.ts:131](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGenerator.interface.ts#L131)

Generator name
Must match the EntityMetadata.repository field

#### Example

```ts
('Repository', 'TreeRepository', 'GraphRepository', 'GeoRepository');
```

## Methods

### declareSymbols()? \{#declaresymbols\}

```ts
declareSymbols ? metadata : RepositoryGeneratorSymbols;
```

Defined in: [generators/RepositoryGenerator.interface.ts:162](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGenerator.interface.ts#L162)

Self-reports the symbols this generator will write, used for the pre-generation conflict check and entity declarations.

#### Parameters

| Parameter  | Type                                                          | Description                    |
| ---------- | ------------------------------------------------------------- | ------------------------------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Metadata of the current entity |

#### Returns

[`RepositoryGeneratorSymbols`](RepositoryGeneratorSymbols.md)

The symbols this generator writes for the entity

#### Remarks

The pre-check must finish before the ts-morph Project is created, when no artifact text exists to scan yet,
so only the generator itself can declare its symbols. A generator that does not implement this method claims no names — the symbols it writes therefore
do not participate in the pre-check, and conflicts only surface in the member validation during the [generate](#generate) write-out phase.

---

### generate() \{#generate\}

```ts
generate(context): void;
```

Defined in: [generators/RepositoryGenerator.interface.ts:168](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGenerator.interface.ts#L168)

Generates the properties and methods specific to the Repository

#### Parameters

| Parameter | Type                                      | Description        |
| --------- | ----------------------------------------- | ------------------ |
| `context` | [`GeneratorContext`](GeneratorContext.md) | Generation context |

#### Returns

`void`
