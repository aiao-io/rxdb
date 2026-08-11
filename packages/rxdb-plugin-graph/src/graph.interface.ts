import { IEntity, IEntityStaticType } from '@aiao/rxdb';

/**
 * 图实体接口
 * 表示支持图结构操作的实体类型
 */
export type IGraphEntity = IEntity;

/**
 * 图实体类型
 * 扩展了基础实体静态类型，支持图结构操作的构造函数类型
 *
 * @remarks
 * RAN-014：形参写 `never[]` 而不是 `unknown[]`。构造函数形参逆变，`unknown[]` 会把
 * **任何声明了形参的实体类**排除在外（`unknown` 不可赋给 `string` 之类的具体形参），
 * 于是这条约束只对无参构造的类成立 —— 三端把图 hooks 收紧到本类型后立刻暴露。
 * `never[]` 才是与核心 `EntityType` / `TreeEntityType` 一致的写法，
 * 语义见 `packages/rxdb/src/entity/entity.interface.ts` 对 `new (...args: never[])` 的说明。
 */
export type GraphEntityType = IEntityStaticType & (new (...args: never[]) => IGraphEntity);
