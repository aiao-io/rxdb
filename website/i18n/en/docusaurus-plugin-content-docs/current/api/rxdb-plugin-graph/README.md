# rxdb-plugin-graph

> Implements: [US-503 graph data plugin](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/plugin/US-503-graph-data.md)

The RxDB graph data plugin, providing directed/undirected graphs, optional edge weights and properties, neighbor queries and path queries.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-adapter-wa-sqlite @aiao/rxdb-plugin-graph
```

## Usage

```typescript
import { PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { GraphEntity, GraphEntityBase, rxDBPluginGraph } from '@aiao/rxdb-plugin-graph';
// The SQLite implementation is imported from a subpath — the root entry no longer pulls it in,
// so PGlite / Supabase-only users do not pay the bundle cost for it (GRAPH-010)
import { SqliteGraphRepository } from '@aiao/rxdb-plugin-graph/sqlite';

@GraphEntity({
  name: 'Person',
  properties: [{ name: 'name', type: PropertyType.string }],
  features: `{ graph: { type: 'directed-graph', weight: true } }`
})
class Person extends GraphEntityBase {
  name!: string;
}

const rxdb = new RxDB({
  dbName: 'social',
  entities: [Person],
  sync: `{ type: SyncType.None, local: { adapter: 'wa-sqlite' } }`
});

rxdb.use(rxDBPluginGraph).adapter(
  'wa-sqlite',
  db =>
    new RxDBAdapterWaSqlite(db, {
      vfs: 'MemoryAsyncVFS',
      async: true,
      wasmPath: '/wa-sqlite/wa-sqlite-async.wasm',
      repositories: `{ GraphRepository: SqliteGraphRepository }`
    })
);

await rxdb.connect('wa-sqlite');
rxdb.init();

const alice = new Person({ name: 'Alice' });
const bob = new Person({ name: 'Bob' });
await rxdb.entityManager.saveMany([alice, bob]);
await Person.addEdge(alice, bob, 1);

Person.findNeighbors$({ entityId: alice.id, direction: 'out', level: 1 }).subscribe(neighbors => {
  console.log(neighbors[0]?.node.name);
});
```

`level=0` returns no neighbors. `findNeighbors()`, `countNeighbors()` and `findPaths()` keep the Promise API; the corresponding `findNeighbors$()`, `countNeighbors$()` and `findPaths$()` return Observables that refresh when nodes or edges change. Neighbor queries do not include the starting node; path queries return acyclic paths with the corresponding edge information. Neighbor and path results return at most 1000 entries by default; callers can lower or raise that via `limit`, up to a ceiling of 10000. When the result exceeds `limit`, or the path search hits the internal resource cap, the array's `truncated` is `true`.

## Edge table and writable checkout

The edge table is an entity the plugin registers separately for each graph entity (`<node name>_edges`); when a node is deleted its edges are cascade-deleted with it. When a node writes no changelog (`log: false`), its edges do not either — same rule as many-to-many junction tables. When the instance is mounted on the working-tree plugin's writable checkout, both nodes and edges go into that shadow table set, and neighbor and path queries only see that set. When only one of nodes or edges is in the shadow table (for example the node syncs via QueryCache but the edges do not), graph queries are rejected outright — data from two checkouts is never spliced into one graph.

## Connection epoch

The plugin declares `lifecycle: 'scoped'`; its only host change — registering `GraphRepository` — is recorded on the scope received by `install(scope)` and revoked together with the scope on `disconnectAll()`; the host does not call `destroy()`. Re-`connect()` re-registers. Before this change, nobody cleaned up that registration — after a disconnect the repository stayed on `rxdb`, pointing at an epoch that had already been dismantled.

## Fileoverview

RxDB Graph plugin
A graph database plugin providing graph structure data storage and query capabilities

Main features:
- Graph structure entity support (GraphEntity)
- Neighbor node queries (findNeighbors)
- Path queries (findPaths)
- Edge management (addEdge/removeEdge)

## Classes

| Class | Description |
| ------ | ------ |
| [GraphEntityBase](classes/GraphEntityBase.md) | Graph entity decorator configuration; defines the edge relations and traversal capabilities required by the graph structure |
| [GraphRepository](classes/GraphRepository.md) | Graph structure entity repository; provides graph query capabilities: neighbor node queries, path queries, etc. |
| [RxDBPluginGraph](classes/RxDBPluginGraph.md) | RxDB plugin interface |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [CountNeighborsQuery](interfaces/CountNeighborsQuery.md) | CountNeighbors query task; counts the neighbor nodes of the given node |
| [EdgeFilterOptionsFull](interfaces/EdgeFilterOptionsFull.md) | Edge filter conditions (weight + properties) |
| [EdgeFilterOptionsWithProperties](interfaces/EdgeFilterOptionsWithProperties.md) | Edge filter conditions (with properties) |
| [EdgeFilterOptionsWithWeight](interfaces/EdgeFilterOptionsWithWeight.md) | Edge filter conditions (with weight) |
| [EdgeInfo](interfaces/EdgeInfo.md) | Edge information (basic) |
| [EdgeInfoFull](interfaces/EdgeInfoFull.md) | Edge information (weight + properties) |
| [EdgeInfoWithProperties](interfaces/EdgeInfoWithProperties.md) | Edge information (with properties) |
| [EdgeInfoWithWeight](interfaces/EdgeInfoWithWeight.md) | Edge information (with weight) |
| [FindNeighborsOptions](interfaces/FindNeighborsOptions.md) | Graph neighbor query options (basic) |
| [FindNeighborsQuery](interfaces/FindNeighborsQuery.md) | FindNeighbors query task; finds the neighbor nodes of the given node |
| [FindPathsOptions](interfaces/FindPathsOptions.md) | Graph path query options (basic) |
| [FindPathsQuery](interfaces/FindPathsQuery.md) | FindPaths query task; finds all paths between two nodes |
| [GraphPath](interfaces/GraphPath.md) | Graph path result |
| [IGraphRepository](interfaces/IGraphRepository.md) | Graph repository interface (basic) |
| [NeighborResult](interfaces/NeighborResult.md) | Graph neighbor query result (basic) |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [EdgeFilterOptions](type-aliases/EdgeFilterOptions.md) | Base interface for edge filter conditions (no weight, no properties) |
| [GraphEdgeInfoType](type-aliases/GraphEdgeInfoType.md) | - |
| [GraphEdgeProperties](type-aliases/GraphEdgeProperties.md) | - |
| [GraphEdgePropertiesRecord](type-aliases/GraphEdgePropertiesRecord.md) | - |
| [GraphEdgePropertyValue](type-aliases/GraphEdgePropertyValue.md) | Edge property value type |
| [GraphEntityType](type-aliases/GraphEntityType.md) | Graph entity type; extends the base entity static type with the constructor type supporting graph operations |
| [GraphQueryResult](type-aliases/GraphQueryResult.md) | Graph query array with resource truncation state. |
| [GraphWhere](type-aliases/GraphWhere.md) | Node filter conditions for graph queries |
| [IGraphEntity](type-aliases/IGraphEntity.md) | Graph entity interface; represents entity types supporting graph operations |

## Variables

| Variable | Description |
| ------ | ------ |
| [GRAPH\_DEFAULT\_MAX\_DEPTH](variables/GRAPH_DEFAULT_MAX_DEPTH.md) | Default maximum depth for path queries |
| [GRAPH\_DEFAULT\_RESULT\_LIMIT](variables/GRAPH_DEFAULT_RESULT_LIMIT.md) | Default maximum number of results returned by graph queries. |
| [GRAPH\_ENTITY\_BASE\_OPTIONS](variables/GRAPH_ENTITY_BASE_OPTIONS.md) | Metadata options of the graph entity base class |
| [GRAPH\_MAX\_DEPTH](variables/GRAPH_MAX_DEPTH.md) | Maximum depth limit for path queries |
| [GRAPH\_MAX\_LEVEL](variables/GRAPH_MAX_LEVEL.md) | Maximum level for graph queries; prevents performance issues from overly deep recursive queries |
| [GRAPH\_MAX\_PATH\_EXPANSIONS](variables/GRAPH_MAX_PATH_EXPANSIONS.md) | Maximum number of rows a single path query may add to the recursive CTE. |
| [GRAPH\_MAX\_RESULT\_LIMIT](variables/GRAPH_MAX_RESULT_LIMIT.md) | Hard ceiling on the result count a caller may request from graph queries. |
| [GRAPH\_QUERY\_TYPES](variables/GRAPH_QUERY_TYPES.md) | Set of graph query task types; used in merge operations to quickly determine whether a query is graph-related |
| [rxDBPluginGraph](variables/rxDBPluginGraph.md) | - |

## Functions

| Function | Description |
| ------ | ------ |
| [createGraphQueryResult](functions/createGraphQueryResult.md) | Attaches a non-enumerable truncation state to the array while preserving the existing array comparison and serialization behavior. |
| [GraphEntity](functions/GraphEntity.md) | Graph entity decorator; marks a class as a graph structure entity, handles graph-specific metadata, generates the edges table, etc. |
| [normalizeNeighborsOptions](functions/normalizeNeighborsOptions.md) | Normalizes neighbor query options |
| [normalizePathsOptions](functions/normalizePathsOptions.md) | Normalizes path query options |
