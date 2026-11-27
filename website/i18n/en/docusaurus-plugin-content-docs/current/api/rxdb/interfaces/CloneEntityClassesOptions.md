# CloneEntityClassesOptions

Defined in: [packages/rxdb/src/entity/clone-entity-classes.ts:114](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/clone-entity-classes.ts#L114)

Options for [cloneEntityClasses](../functions/cloneEntityClasses.md).

## Properties

### log? \{#log\}

```ts
readonly log?: false;
```

Defined in: [packages/rxdb/src/entity/clone-entity-classes.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/clone-entity-classes.ts#L121)

The clone does not write a change log (metadata `log: false`): the new instance's database does not create
the change-log triggers.

#### Remarks

Used by the snapshot database of a read-only checkout: a snapshot is the data at the moment another line was
created, is not on any branch, and has no changes to record.
