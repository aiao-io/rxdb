# cloneEntityClasses()

```ts
function cloneEntityClasses(entities, options?): EntityType[];
```

Defined in: [packages/rxdb/src/entity/clone-entity-classes.ts:147](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/clone-entity-classes.ts#L147)

Clones a group of entity classes, isolating registration side effects across instances / suites.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entities` | [`EntityType`](../type-aliases/EntityType.md)[] | The entity classes to clone, order preserved |
| `options?` | [`CloneEntityClassesOptions`](../interfaces/CloneEntityClassesOptions.md) | See [CloneEntityClassesOptions](../interfaces/CloneEntityClassesOptions.md) |

## Returns

[`EntityType`](../type-aliases/EntityType.md)[]

Clones in one-to-one correspondence with the inputs; each clone `extends` its source class

## Remarks

A clone's metadata is a **new object whose prototype is the source metadata**, not the same reference: reads go through the prototype chain as usual,
while writes on the clone's side stay on itself and never flow back to the source class or another instance's clone. Relation tables get their own copy
(see cloneMetadata); otherwise the many-to-many junction table would be rewritten by the instance initialized later.

A clone's class name is `<source class name>Clone`: distinguishable from the source class (two instances' error messages will never share a name),
while still showing which entity class it came from.

## Example

```ts
const [IsolatedUser] = cloneEntityClasses([User]);
const rxdb = new RxDB({ entities: [IsolatedUser], ... });
```
