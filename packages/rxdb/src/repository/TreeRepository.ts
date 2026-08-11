import { Observable, switchMap, tap } from 'rxjs';
import { EntityType } from '../entity/entity.interface.js';
import { ITreeEntity } from '../entity/tree-entity.interface.js';
import { getFingerprintByEntities, getFingerprintPrimitive } from './fingerprint.utils.js';
import { Repository } from './Repository.js';
import { assertTreeLevel, TREE_MAX_LEVEL } from './tree-level.utils.js';
import { FindTreeOptions, ITreeRepository } from './tree-repository.interface.js';

/**
 * 树结构实体仓库
 * 根据配置决策实体的具体操作
 *
 * @template T - 必须是实现 ITreeEntity 接口的实体类型（通常继承 TreeAdjacencyListEntityBase）
 *
 * @example
 * ```typescript
 * // ✅ 正确：继承 TreeAdjacencyListEntityBase
 * // 不必写 repository：`repository: 'TreeRepository'` 与 `features.tree` 都由基类声明，
 * // 沿原型链继承下来（要覆盖就在自己的 @Entity 里显式声明）
 * @Entity({ name: 'Category' })
 * class Category extends TreeAdjacencyListEntityBase {
 *   name!: string;
 * }
 *
 * // 可以使用树查询方法
 * Category.findDescendants({ entityId: 'root-id' });
 * Category.findAncestors({ entityId: 'leaf-id' });
 *
 * // ❌ 错误：只继承 EntityBase，没有实现 ITreeEntity
 * @Entity({ name: 'User' })
 * class User extends EntityBase {
 *   name!: string;
 * }
 *
 * // 编译错误：User 不满足 TreeRepository 的类型约束
 * // User.findDescendants({ entityId: 'id' }); // TypeScript 错误
 * ```
 */

export class TreeRepository<
  T extends EntityType & (new (...args: never[]) => ITreeEntity),
  RepositoryType extends ITreeRepository<T> = ITreeRepository<T>
> extends Repository<T, RepositoryType> {
  protected static override _STATIC_METHODS = [
    ...super._STATIC_METHODS,
    'findDescendants',
    'countDescendants',
    'findAncestors',
    'countAncestors'
  ];

  /**
   * 查询子孙
   */
  findDescendants(options: FindTreeOptions<T>): Observable<InstanceType<T>[]> {
    options = this.#normalizeOptions(options);
    const runner = () =>
      this.primary$.pipe(
        switchMap(local => local.findDescendants(options)),
        tap(this._setLocals)
      );
    return this.queryManager.createTask({
      options: { type: 'findDescendants', options },
      runner,
      getFingerprint: getFingerprintByEntities
    }).result$;
  }

  /**
   * 查询子孙数量
   */
  countDescendants(options: FindTreeOptions<T>): Observable<number> {
    options = this.#normalizeOptions(options);
    const runner = () => this.primary$.pipe(switchMap(local => local.countDescendants(options)));
    return this.queryManager.createTask({
      options: { type: 'countDescendants', options },
      runner,
      getFingerprint: getFingerprintPrimitive
    }).result$;
  }

  /**
   * 查询祖先
   */
  findAncestors(options: FindTreeOptions<T>): Observable<InstanceType<T>[]> {
    options = this.#normalizeOptions(options);
    const runner = () =>
      this.primary$.pipe(
        switchMap(local => local.findAncestors(options)),
        tap(this._setLocals)
      );
    return this.queryManager.createTask({
      options: { type: 'findAncestors', options },
      runner,
      getFingerprint: getFingerprintByEntities
    }).result$;
  }

  /**
   * 查询祖先数量
   */
  countAncestors(options: FindTreeOptions<T>): Observable<number> {
    options = this.#normalizeOptions(options);
    const runner = () => this.primary$.pipe(switchMap(local => local.countAncestors(options)));
    return this.queryManager.createTask({
      options: { type: 'countAncestors', options },
      runner,
      getFingerprint: getFingerprintPrimitive
    }).result$;
  }

  /**
   * 归一查询选项。
   *
   * `level` 的两层处理**互相衔接、不冲突**：
   * 先按 {@link FindTreeOptions.level} 的 `@remarks` 对数字做裁剪（`< 0 → 0`、`> TREE_MAX_LEVEL → 100`），
   * 再交给 {@link assertTreeLevel} 兜住裁剪管不到的情况 —— 无类型调用方传来的字符串/小数/NaN
   * 既不小于 0 也不大于 100，会原样穿过裁剪并被适配器直接插值进 SQL。
   * 在这里同步抛错，比让它走到 SQL 生成再炸更早、也与适配器无关。
   */
  #normalizeOptions(options: FindTreeOptions<T>): FindTreeOptions<T> {
    const opt: FindTreeOptions<T> = { ...options };
    const level = opt.level ?? 0;
    // 负数规范化为 0，超过最大值限制为 TREE_MAX_LEVEL
    if (level < 0) {
      opt.level = 0;
    } else if (level > TREE_MAX_LEVEL) {
      opt.level = TREE_MAX_LEVEL;
    } else {
      opt.level = assertTreeLevel(level);
    }
    opt.entityId = opt.entityId ?? null;
    return opt;
  }
}
