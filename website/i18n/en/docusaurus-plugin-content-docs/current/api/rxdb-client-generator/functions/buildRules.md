# buildRules()

```ts
function buildRules(
   entityRules, 
   rxdbNamedImports, 
   siblingNamedImports?
): string[];
```

Defined in: [generators/RepositoryGeneratorBase.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGeneratorBase.ts#L57)

Renders rule data into rule type literals, and registers the required named imports along the way.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entityRules` | [`RuleTypeData`](../interfaces/RuleTypeData.md)[] | Rule data produced by [generateEntityRules](generateEntityRules.md) |
| `rxdbNamedImports` | `Set`&lt;`string`&gt; | Set of rule names imported from `@aiao/rxdb`, filled in on the spot while rendering |
| `siblingNamedImports?` | `Map`&lt;`string`, `Set`&lt;`string`&gt;&gt; | Named import sets of sibling entity files in the same directory; `Partial<XxxKeyValue>` produced by recursive relations is registered under the peer entity's name; registration is skipped when not provided |

## Returns

`string`[]

Array of rule type literals, in the same order as `entityRules`

## Example

```ts
const rules = buildRules(generateEntityRules(generator, metadata), rxdbNamedImports);
```
