import '@angular/compiler';
import { PropertyType, RxDB, SyncType, type RxDBEntityId } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { TreeEntity, TreeAdjacencyListEntityBase, rxDBPluginTree, type FindTreeOptions, type ITreeRepository } from '@aiao/rxdb-plugin-tree';
import * as angularTree from '@aiao/rxdb-plugin-tree-angular';
import * as reactTree from '@aiao/rxdb-plugin-tree-react';
import * as vueTree from '@aiao/rxdb-plugin-tree-vue';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { act, cleanup, renderHook } from '@testing-library/react';
import { defer, finalize, firstValueFrom, type Observable } from 'rxjs';
import { effectScope, shallowRef } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const methods = ['findDescendants', 'countDescendants', 'findAncestors', 'countAncestors'] as const;
const ids = (nodes: readonly { readonly id: RxDBEntityId }[]) => nodes.map(node => String(node.id)).sort();
const idFor = (kind: 'number' | 'string', number: number): RxDBEntityId => kind === 'number' ? number : `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;

const createNode = (kind: 'number' | 'string') => {
  @TreeEntity({name: `ReviewTree${kind}`, log: false, properties: [
    {name: 'id', type: kind === 'number' ? PropertyType.integer : PropertyType.uuid, primary: true},
    {name: 'name', type: PropertyType.string}
  ]})
  class Node extends TreeAdjacencyListEntityBase<RxDBEntityId> { declare name: string; }
  return Node;
};

type NodeType = ReturnType<typeof createNode>;
interface QueryInput { root: RxDBEntityId; leaf: RxDBEntityId; level?: number; }
const optionsFor = (input: QueryInput) => ({desc: {entityId: input.root, level: input.level}, anc: {entityId: input.leaf, level: input.level}});

const mountReact = (Node: NodeType, input: QueryInput) => renderHook(({query}) => {
  const options = optionsFor(query);
  return {
    descendants: reactTree.useFindDescendants(Node, options.desc),
    descendantCount: reactTree.useCountDescendants(Node, options.desc),
    ancestors: reactTree.useFindAncestors(Node, options.anc),
    ancestorCount: reactTree.useCountAncestors(Node, options.anc)
  };
}, {initialProps: {query: input}, reactStrictMode: true});

const mountAngular = (Node: NodeType, query: () => QueryInput) => TestBed.runInInjectionContext(() => ({
  descendants: angularTree.useFindDescendants(Node, () => optionsFor(query()).desc),
  descendantCount: angularTree.useCountDescendants(Node, () => optionsFor(query()).desc),
  ancestors: angularTree.useFindAncestors(Node, () => optionsFor(query()).anc),
  ancestorCount: angularTree.useCountAncestors(Node, () => optionsFor(query()).anc)
}));

const mountVue = (Node: NodeType, query: () => QueryInput) => ({
  descendants: vueTree.useFindDescendants(Node, () => optionsFor(query()).desc),
  descendantCount: vueTree.useCountDescendants(Node, () => optionsFor(query()).desc),
  ancestors: vueTree.useFindAncestors(Node, () => optionsFor(query()).anc),
  ancestorCount: vueTree.useCountAncestors(Node, () => optionsFor(query()).anc)
});

const snapshot = (resources: ReturnType<typeof mountVue>) => ({
  descendants: ids(resources.descendants.value), descendantCount: resources.descendantCount.value,
  ancestors: ids(resources.ancestors.value), ancestorCount: resources.ancestorCount.value,
  state: Object.values(resources).map(resource => ({hasValue: resource.hasValue, isLoading: resource.isLoading, isEmpty: resource.isEmpty, error: resource.error?.message}))
});
const readAngular = (resources: ReturnType<typeof mountAngular>) => snapshot({
  descendants: {value: resources.descendants.value(), hasValue: resources.descendants.hasValue(), isLoading: resources.descendants.isLoading(), isEmpty: resources.descendants.isEmpty(), error: resources.descendants.error()},
  descendantCount: {value: resources.descendantCount.value(), hasValue: resources.descendantCount.hasValue(), isLoading: resources.descendantCount.isLoading(), isEmpty: resources.descendantCount.isEmpty(), error: resources.descendantCount.error()},
  ancestors: {value: resources.ancestors.value(), hasValue: resources.ancestors.hasValue(), isLoading: resources.ancestors.isLoading(), isEmpty: resources.ancestors.isEmpty(), error: resources.ancestors.error()},
  ancestorCount: {value: resources.ancestorCount.value(), hasValue: resources.ancestorCount.hasValue(), isLoading: resources.ancestorCount.isLoading(), isEmpty: resources.ancestorCount.isEmpty(), error: resources.ancestorCount.error()}
});

const instrument = (Node: NodeType) => {
  const counts = {active: 0, opened: 0, finalized: 0};
  for (const method of methods) {
    const original = Node[method] as (options: FindTreeOptions<NodeType>) => Observable<unknown>;
    Object.defineProperty(Node, method, {configurable: true, writable: true, value: (options: FindTreeOptions<NodeType>) => defer(() => {
      counts.active += 1; counts.opened += 1;
      return original.call(Node, options).pipe(finalize(() => {counts.active -= 1; counts.finalized += 1;}));
    })});
  }
  return counts;
};

const createDatabase = (Node: NodeType, syncType: SyncType = SyncType.None, withPlugin = true) => {
  const db = new RxDB({dbName: 'r3-real-tree', context: {userId: 'review'}, entities: [Node], sync: {local: {adapter: 'pglite'}, type: syncType}});
  if (withPlugin) db.use(rxDBPluginTree);
  db.adapter('pglite', database => new RxDBAdapterPGlite(database, {store: 'memory'}));
  return db;
};

const fullSnapshot = async (adapter: RxDBAdapterPGlite, Node: NodeType, query: QueryInput) => {
  const repository = adapter.getRepository<NodeType, ITreeRepository<NodeType>>(Node);
  const options = optionsFor(query);
  return {
    descendants: ids(await repository.findDescendants(options.desc)), descendantCount: await repository.countDescendants(options.desc),
    ancestors: ids(await repository.findAncestors(options.anc)), ancestorCount: await repository.countAncestors(options.anc)
  };
};

beforeEach(() => {
  if (!TestBed.platform) TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({providers: [provideZonelessChangeDetection()]});
});
afterEach(() => { cleanup(); TestBed.resetTestingModule(); });

for (const kind of ['number', 'string'] as const) {
  describe(`真实 PGlite ${kind} 树的三框架对照`, () => {
    it('四查询、层级、跨父移动、级联删除、空树和多实例退订与独立 SQL 全查一致', async () => {
      const Node = createNode(kind); const db = createDatabase(Node);
      const root = idFor(kind, 0); const child = idFor(kind, 1); const leaf = idFor(kind, 2); const other = idFor(kind, 9);
      const query: QueryInput = {root, leaf};
      const angularQuery = signal(query); const vueQuery = shallowRef(query);
      let stop = () => {};
      try {
        const adapter = await db.connect('pglite') as RxDBAdapterPGlite;
        const counts = instrument(Node);
        for (const record of [{id: root, name: 'root', parentId: null}, {id: child, name: 'child', parentId: root}, {id: leaf, name: 'leaf', parentId: child}, {id: other, name: 'other', parentId: null}]) await new Node(record).save();
        const react = mountReact(Node, query); const secondReact = mountReact(Node, query);
        const angular = mountAngular(Node, angularQuery); const secondAngular = mountAngular(Node, angularQuery);
        const scope = effectScope(); const vue = scope.run(() => mountVue(Node, () => vueQuery.value))!;
        const secondScope = effectScope(); const secondVue = secondScope.run(() => mountVue(Node, () => vueQuery.value))!;
        const readers = [() => snapshot(react.result.current), () => snapshot(secondReact.result.current), () => readAngular(angular), () => readAngular(secondAngular), () => snapshot(vue), () => snapshot(secondVue)];
        readers.forEach(read => expect(read().state.every(state => !state.hasValue && state.isLoading)).toBe(true));
        const assertResult = async (expected: {descendants: string[]; descendantCount: number; ancestors: string[]; ancestorCount: number}) => {
          await vi.waitFor(async () => {await act(async () => {TestBed.tick(); await new Promise(resolve => setTimeout(resolve, 10));}); for (const [index, read] of readers.entries()) {
            const result = read(); expect(result, `framework reader ${index}`).toMatchObject(expected); expect(result.state.every(state => state.hasValue && !state.isLoading && state.error === undefined)).toBe(true);
          }}, {timeout: 5000, interval: 10});
          expect(await fullSnapshot(adapter, Node, angularQuery())).toEqual(expected);
        };
        await assertResult({descendants: ids([{id: root}, {id: child}, {id: leaf}]), descendantCount: 2, ancestors: ids([{id: root}, {id: child}, {id: leaf}]), ancestorCount: 2});
        const setQuery = async (next: QueryInput) => {angularQuery.set(next); vueQuery.value = next; await act(async () => {react.rerender({query: next}); secondReact.rerender({query: next});});};
        await setQuery({...query, level: 0});
        await assertResult({descendants: [String(root)], descendantCount: 0, ancestors: [String(leaf)], ancestorCount: 0});
        await setQuery(query);
        await assertResult({descendants: ids([{id: root}, {id: child}, {id: leaf}]), descendantCount: 2, ancestors: ids([{id: root}, {id: child}, {id: leaf}]), ancestorCount: 2});
        const moving = await firstValueFrom(Node.get(leaf)); expect(moving).toBeDefined(); moving!.parentId = other; await moving!.save();
        await assertResult({descendants: ids([{id: root}, {id: child}]), descendantCount: 1, ancestors: ids([{id: other}, {id: leaf}]), ancestorCount: 1});
        const parent = await firstValueFrom(Node.get(root)); await parent!.remove();
        await assertResult({descendants: [], descendantCount: 0, ancestors: ids([{id: other}, {id: leaf}]), ancestorCount: 1});
        readers.forEach(read => {expect(read().state[0]?.isEmpty).toBe(true);});
        stop = () => {react.unmount(); secondReact.unmount(); scope.stop(); secondScope.stop(); TestBed.resetTestingModule();};
        stop(); expect(counts.active).toBe(0); expect(counts.opened).toBe(counts.finalized);
        await new Node({id: idFor(kind, 10), name: 'after-unmount', parentId: other}).save();
        expect(counts.active).toBe(0);
      } finally {stop(); await db.destroy();}
    });
  });
}

it('真实注册期拒绝漏装 Tree 插件和 QueryCache 组合', async () => {
  const missing = createDatabase(createNode('number'), SyncType.None, false);
  const cached = createDatabase(createNode('string'), SyncType.QueryCache);
  try {expect(() => missing.init()).toThrow(/Repository 'TreeRepository' not found/); expect(() => cached.init()).toThrow(/TreeRepository 不支持 SyncType.QueryCache/);}
  finally {await missing.destroy(); await cached.destroy();}
});
