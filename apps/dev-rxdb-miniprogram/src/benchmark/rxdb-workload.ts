/**
 * @fileoverview {@link BenchmarkWorkload} 的 RxDB 实现，读写路径与仓库根 `benchmarks/src/scenarios/` 相同：
 * 单条 `save()`、批量 `entityManager.saveMany()`、查询 `repository.findAll()` 取第一帧。
 *
 * 只 `import type` RxDB；运行时模块由调用方传入（支付宝构建要求 RxDB 栈只经动态 `import()` 可达）。
 */

import type { RxDB } from '@aiao/rxdb';
import { firstValue } from '../first-value';
import type { BenchmarkWorkload } from './scenarios';

type RxdbModule = typeof import('@aiao/rxdb');

/** 一组 where 规则；字段名与运算符同 `benchmarks/`。 */
type Rule =
  { field: 'title'; operator: 'contains'; value: string } | { field: 'completed'; operator: '='; value: boolean };

/**
 * 定义性能测试专用的 Todo 实体，表 `miniprogram$benchmark_todo`，与演示 Todo 分开。
 *
 * @param rxdb - 动态加载的 `@aiao/rxdb`
 */
export function defineBenchmarkEntities(rxdb: RxdbModule) {
  class BenchmarkTodoModel extends rxdb.EntityBase {
    title!: string;
    completed!: boolean;
  }

  const BenchmarkTodo = rxdb.Entity({
    name: 'MiniProgramBenchmarkTodo',
    tableName: 'benchmark_todo',
    namespace: 'miniprogram',
    log: false,
    properties: [
      { name: 'title', type: rxdb.PropertyType.string, required: true },
      { name: 'completed', type: rxdb.PropertyType.boolean, default: false }
    ]
  })(BenchmarkTodoModel);

  return { BenchmarkTodo };
}

type BenchmarkEntities = ReturnType<typeof defineBenchmarkEntities>;

type BenchmarkTodo = InstanceType<BenchmarkEntities['BenchmarkTodo']>;

/** 在一个已连接的 RxDB 实例上执行性能测试的数据操作。 */
export class RxdbBenchmarkWorkload implements BenchmarkWorkload {
  private readonly rxdb: RxDB;
  private readonly entities: BenchmarkEntities;

  /**
   * @param rxdb - 已连接、实体里含 `BenchmarkTodo` 的 RxDB 实例
   * @param entities - {@link defineBenchmarkEntities} 的返回值
   */
  constructor(rxdb: RxDB, entities: BenchmarkEntities) {
    this.rxdb = rxdb;
    this.entities = entities;
  }

  async insertOne(title: string): Promise<void> {
    await this.create(title, false).save();
  }

  async insertMany(count: number, prefix: string): Promise<void> {
    const todos = Array.from({ length: count }, (_, i) => this.create(`${prefix}-${i}`, i % 3 === 0));
    await this.rxdb.entityManager.saveMany(todos);
  }

  async countAll(): Promise<number> {
    return (await this.find([])).length;
  }

  async countCompleted(completed: boolean): Promise<number> {
    return (await this.find([{ field: 'completed', operator: '=', value: completed }])).length;
  }

  async countTitleContains(term: string): Promise<number> {
    return (await this.find([{ field: 'title', operator: 'contains', value: term }])).length;
  }

  async clear(): Promise<void> {
    const todos = await this.find([]);
    if (todos.length > 0) await this.rxdb.entityManager.removeMany(todos);
  }

  private create(title: string, completed: boolean) {
    const todo = new this.entities.BenchmarkTodo();
    todo.title = title;
    todo.completed = completed;
    return todo;
  }

  private find(rules: Rule[]): Promise<BenchmarkTodo[]> {
    const repository = this.rxdb.entityManager.getRepository(this.entities.BenchmarkTodo);
    return firstValue(repository.findAll({ where: { combinator: 'and', rules } }));
  }
}
