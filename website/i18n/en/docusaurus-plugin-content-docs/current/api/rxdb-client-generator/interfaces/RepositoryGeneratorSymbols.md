# RepositoryGeneratorSymbols

Defined in: [generators/RepositoryGenerator.interface.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGenerator.interface.ts#L67)

Artifact symbols self-reported by a generator

## Remarks

Corresponds one-to-one with [IRepositoryGenerator.generate](IRepositoryGenerator.md#generate): **declares only the symbols this generator itself writes**.
Entities of an extended type (whose `repository` is not `Repository`) first go through a round of base-class `Repository` generation,
and the symbols of that round are self-reported by the base-class generator; a subclass that overrides `generateMethods` without calling `super`
must likewise override [IRepositoryGenerator.declareSymbols](IRepositoryGenerator.md#declaresymbols) without merging the parent's result, otherwise the same
symbol is declared twice and the pre-check treats it as a conflict.

## Properties

### entityInterfaces? \{#entityinterfaces\}

```ts
readonly entityInterfaces?: readonly string[];
```

Defined in: [generators/RepositoryGenerator.interface.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGenerator.interface.ts#L76)

Interface names that the entity class should `implement`, imported from [IRepositoryGenerator.entityBaseModuleSpecifier](IRepositoryGenerator.md#entitybasemodulespecifier);
when non-empty, they replace the default `IEntity`.

***

### instanceMembers? \{#instancemembers\}

```ts
readonly instanceMembers?: readonly string[];
```

Defined in: [generators/RepositoryGenerator.interface.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGenerator.interface.ts#L71)

Names of instance members written onto the entity class.

***

### types? \{#types\}

```ts
readonly types?: readonly RepositoryGeneratorTypeSymbol[];
```

Defined in: [generators/RepositoryGenerator.interface.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGenerator.interface.ts#L69)

Top-level types written into the entity declaration file.
