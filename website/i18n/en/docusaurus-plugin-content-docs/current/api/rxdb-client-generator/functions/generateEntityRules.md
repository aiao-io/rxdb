# generateEntityRules()

```ts
function generateEntityRules(generator, metadata, firstMetadata?, ignoreKeys?, result?, patch?): RuleTypeData[];
```

Defined in: [generators/entity-rules.ts:289](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/entity-rules.ts#L289)

Recursively collects all query rules of an entity (including foreign keys and relation peers).

## Parameters

| Parameter        | Type                                                                                  | Default value | Description                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------- |
| `generator`      | [`RxDBClientGenerator`](../classes/RxDBClientGenerator.md)                            | `undefined`   | Generator instance holding all entity metadata, used to resolve relation peers                              |
| `metadata`       | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md)                         | `undefined`   | Entity metadata of the current recursion level                                                              |
| `firstMetadata?` | `Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt; | `undefined`   | Entity metadata of the recursion origin; defaults to `metadata` when omitted                                |
| `ignoreKeys?`    | `string`[]                                                                            | `[]`          | Property names to skip at this level, to avoid repeatedly expanding relation cycles                         |
| `result?`        | [`RuleTypeData`](../interfaces/RuleTypeData.md)[]                                     | `[]`          | Accumulator array, passed through during recursion                                                          |
| `patch?`         | `PatchData`[]                                                                         | `[]`          | Path segments from the recursion origin to the current level, used to compose rule keys of the form `a.b.c` |

## Returns

[`RuleTypeData`](../interfaces/RuleTypeData.md)[]

The accumulated rule array (the same reference as the `result` argument)

## Example

```ts
const rules = generateEntityRules(generator, metadata);
```
