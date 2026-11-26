# Entity()

```ts
function Entity(metadataOptions): <T>(target) => T;
```

Defined in: [packages/rxdb/src/entity/entity.decorator.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.decorator.ts#L48)

Entity decorator.
Marks a class as an RxDB entity and handles metadata, proxies, and lifecycle.

The decorator:
1. Transforms and stores the entity metadata
2. Handles the entity's default values and initial values
3. Creates a proxy for the entity to support change tracking and relation management
4. Handles the different behavior of abstract entities and concrete entities

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadataOptions` | [`EntityMetadataOptions`](../interfaces/EntityMetadataOptions.md) | Entity metadata options, including name, display name, properties, relations, indexes, and other configuration |

## Returns

A class decorator function.

&lt;`T`&gt;(`target`) => `T`

## Example

```typescript
// Basic usage
@Entity({ name: 'User' })
class User extends EntityBase {}
```
