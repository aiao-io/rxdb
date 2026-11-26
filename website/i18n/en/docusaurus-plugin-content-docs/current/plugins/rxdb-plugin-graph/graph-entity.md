# GraphEntity and graph modeling

Package entry points are described in [@aiao/rxdb-plugin-graph](./README.md).

Graph structure is for "node + edge" scenarios such as follow relationships, social graphs, dependency graphs, and path search.

The current implementation has two layers:

- Plain many-to-many relations: good for simple connections.
- `@GraphEntity`: for graph scenarios that really need neighbors, paths, edge properties, and edge weights.

## This is not core package functionality

Graph entity APIs come from the separate package `@aiao/rxdb-plugin-graph`; they are not exported by `@aiao/rxdb` itself.

You need at least these imports:

```ts
import { PropertyType } from '@aiao/rxdb';
import { GraphEntity, GraphEntityBase } from '@aiao/rxdb-plugin-graph';
```

To actually run graph queries, you also need to register the graph plugin with the `RxDB` runtime.

## Define a graph entity

```ts
import { PropertyType } from '@aiao/rxdb';
import { GraphEntity, GraphEntityBase } from '@aiao/rxdb-plugin-graph';

@GraphEntity({
  name: 'Person',
  properties: [
    { name: 'name', type: PropertyType.string },
    { name: 'city', type: PropertyType.string, nullable: true }
  ],
  features: {
    graph: {
      type: 'directed-graph',
      weight: true,
      properties: [
        { name: 'category', type: PropertyType.string },
        { name: 'since', type: PropertyType.date }
      ]
    }
  }
})
export class Person extends GraphEntityBase {}
```

## What `features.graph` actually supports

The current code supports:

- `type?: 'undirected-graph' | 'directed-graph'`
- `weight?: boolean`
- `properties?: KeyValuePropertyMetadata[]`

In other words:

- There is no `graphWeight`.
- There is no `graphProperties: true`.

Edge properties are not a boolean switch; they are an explicit structural definition.

## The generated edge entity

`@GraphEntity` creates an edge entity through the repository generator. The edge table name is:

- `${node entity name}_edges`

For example, `Person` generates `Person_edges`.

In a concrete adapter, the real database table name also carries the namespace prefix. In SQLite, for example, you commonly see:

- `public$Person_edges`

Whether the edge table includes `weight` and `properties` columns depends on the `features.graph` configuration.

## Graph query APIs

`GraphEntityBase` provides two kinds of static methods:

- Query methods: `findNeighbors`, `countNeighbors`, and `findPaths` return `Promise`s you can `await` directly;
  the `$`-suffixed variants (`findNeighbors$` and so on) return `Observable`s that push new results when the graph changes.
- Write methods, returning `Promise`: `addEdge`, `removeEdge`.

### Query neighbors

```ts
const neighbors = await Person.findNeighbors({
  entityId: alice.id,
  direction: 'out',
  level: 2,
  edgeWhere: {
    weight: { min: 5 },
    properties: { category: 'friend' }
  }
});
```

The result shape is:

```ts
{
  node,
  edge: {
    sourceId,
    targetId,
    direction,
    weight,
    properties
  },
  level
}
```

### Count neighbors

```ts
const count = await Person.countNeighbors({
  entityId: alice.id,
  direction: 'both',
  level: 1
});
```

### Query paths

```ts
const paths = await Person.findPaths({
  fromId: alice.id,
  toId: bob.id,
  direction: 'out',
  maxDepth: 5
});
```

A path result contains:

- `nodes`
- `edges`
- `length`
- `totalWeight?`

## Query parameter boundaries

### `findNeighbors`

- `entityId`: required
- `direction`: defaults to `'both'`
- `level`: defaults to `1`; the implementation clamps it to `1-10`
- `where`: node filter
- `edgeWhere`: edge filter

### `findPaths`

- `fromId` / `toId`: required
- `direction`: defaults to `'both'`
- `maxDepth`: defaults to `5`; the implementation clamps the maximum depth
- `where`: filter for nodes on the path
- `edgeWhere`: filter for edges on the path

## Edge operations

Both methods return a `Promise` because they are write operations:

```ts
await Person.addEdge(alice, bob, 8, {
  category: 'colleague',
  since: new Date('2024-01-01')
});

await Person.removeEdge(alice, bob);
```

## When to use GraphEntity

A plain many-to-many relation is enough when:

- You only care whether an association exists.
- You do not care about paths, direction, hops, or edge properties.

Use `@GraphEntity` when:

- You need 1-hop / 2-hop / N-hop neighbor queries.
- You need path search.
- You need edge weights.
- You need to filter on edge properties.
