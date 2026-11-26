# GraphEntityType

```ts
type GraphEntityType = IEntityStaticType & (new (...args) => IGraphEntity);
```

Defined in: [rxdb-plugin-graph/src/graph.interface.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph.interface.ts#L20)

Graph entity type
Extends the base entity static type with the constructor type supporting graph operations

## Remarks

RAN-014: the parameter is written `never[]`, not `unknown[]`. Constructor parameters are contravariant, so `unknown[]` would exclude **any entity class that declares parameters** (`unknown` is not assignable to a concrete parameter like `string`), making the constraint hold only for parameterless classes — which surfaced immediately once all three frameworks narrowed their graph hooks to this type. `never[]` is the form consistent with the core `EntityType` / `TreeEntityType`; for the semantics see the note on `new (...args: never[])` in `packages/rxdb/src/entity/entity.interface.ts`.
