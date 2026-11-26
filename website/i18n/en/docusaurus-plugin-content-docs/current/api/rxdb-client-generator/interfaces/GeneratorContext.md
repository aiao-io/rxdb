# GeneratorContext

Defined in: [generators/RepositoryGenerator.interface.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGenerator.interface.ts#L20)

Generator context
Contains all the context information needed to generate properties and methods

## Properties

### classMethods \{#classmethods\}

```ts
classMethods: MethodDeclarationStructure[];
```

Defined in: [generators/RepositoryGenerator.interface.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGenerator.interface.ts#L26)

Array of class method declarations

***

### classProperties \{#classproperties\}

```ts
classProperties: PropertyDeclarationStructure[];
```

Defined in: [generators/RepositoryGenerator.interface.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGenerator.interface.ts#L24)

Array of class property declarations

***

### file \{#file\}

```ts
file: SourceFile;
```

Defined in: [generators/RepositoryGenerator.interface.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGenerator.interface.ts#L42)

Source file

***

### generator \{#generator\}

```ts
generator: RxDBClientGenerator;
```

Defined in: [generators/RepositoryGenerator.interface.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGenerator.interface.ts#L40)

Generator instance

***

### metadata \{#metadata\}

```ts
metadata: EntityMetadata;
```

Defined in: [generators/RepositoryGenerator.interface.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGenerator.interface.ts#L22)

Entity metadata

***

### namedImportsByModule \{#namedimportsbymodule\}

```ts
namedImportsByModule: Map<string, Set<string>>;
```

Defined in: [generators/RepositoryGenerator.interface.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGenerator.interface.ts#L30)

Additional named imports registered by the Repository plugin, grouped by module.

***

### rxdbNamedImports \{#rxdbnamedimports\}

```ts
rxdbNamedImports: Set<string>;
```

Defined in: [generators/RepositoryGenerator.interface.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGenerator.interface.ts#L28)

Set of rxdb named imports

***

### siblingNamedImports \{#siblingnamedimports\}

```ts
siblingNamedImports: Map<string, Set<string>>;
```

Defined in: [generators/RepositoryGenerator.interface.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGenerator.interface.ts#L38)

Names of peer entity types referenced during relation recursion, grouped by peer entity name.

#### Remarks

In split mode each entity has its own `.d.ts`, so these names must be imported from `./<peer entity>.js`,
otherwise the generated rule types reference undeclared identifiers (TS2304). In single-file mode they share one file and no import is needed.

***

### staticTypesInterface \{#statictypesinterface\}

```ts
staticTypesInterface: AddedInterface;
```

Defined in: [generators/RepositoryGenerator.interface.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGenerator.interface.ts#L44)

Static types interface
