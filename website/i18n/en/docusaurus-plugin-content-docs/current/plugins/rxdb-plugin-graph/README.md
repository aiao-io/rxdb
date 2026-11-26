# @aiao/rxdb-plugin-graph

`@aiao/rxdb-plugin-graph` adds graph modeling, edge storage, and neighbor and path queries to RxDB.

It fits these scenarios:

- Social relationship graphs
- Dependency graphs
- Recommendation networks
- Any business model that needs "nodes + edges + path search"

## What it provides

- `@GraphEntity()`: declares a graph entity
- `GraphEntityBase`: the graph entity base class
- `addEdge()` / `removeEdge()`: edge write APIs
- `findNeighbors()` / `countNeighbors()` / `findPaths()`: graph query APIs

## Installation

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-plugin-graph
```

## When to use it

- Plain associations are enough: prefer the relation definitions in the core package.
- You need neighbor queries, path search, edge weights, or edge properties: add `@aiao/rxdb-plugin-graph`.

## Further reading

- [GraphEntity and graph modeling](/plugins/rxdb-plugin-graph/graph-entity.md)
- [Neighbor queries](/model-query/findNeighbors.md)
- [Path queries](/model-query/findPaths.md)
- [API reference](/api/README.md)
