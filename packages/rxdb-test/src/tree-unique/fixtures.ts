/**
 * @fileoverview 「同级唯一」契约套件的实体夹具（RXT-010 / RXT-016）。
 *
 * @remarks
 * 刻意**不复用** `entities/FileNode`、`entities/MenuSimple`：
 * 那两个是发布出去的公共实体，`src/` 的 `rootDir` 也够不到它们。
 * 这里的夹具按 1:1 复刻它们的列形状（尤其是 `parentId` / `extension` 两个可空列），
 * 让「NULL 让唯一索引整条失效」这个缺陷在契约套件里被直接触发；
 * 公共实体自身有没有声明同一条索引，由 `src/entity-model-contract.spec.ts` 的元数据断言负责。
 */
import { PropertyType, TreeAdjacencyListEntityBase, TreeEntity } from '@aiao/rxdb';

/** 夹具实体的 namespace，避免与 demo 实体撞表。 */
const NAMESPACE = 'tree-unique-fixtures';

/**
 * `TreeFile` —— 复刻 `FileNode` 的文件树夹具。
 *
 * @remarks
 * `parentId`（根节点为 NULL）与 `extension`（文件夹为 NULL）都可空，
 * 二者中的任意一个为 NULL 就足以让一条普通 `UNIQUE` 索引对该行完全不生效。
 */
@TreeEntity({
  name: 'TreeFile',
  tableName: 'tree_unique_file',
  namespace: NAMESPACE,
  log: false,
  properties: [
    { name: 'name', type: PropertyType.string, nullable: false },
    { name: 'type', type: PropertyType.enum, enum: ['file', 'folder'], nullable: false },
    { name: 'extension', type: PropertyType.string, nullable: true }
  ],
  features: { tree: { type: 'adjacency-list', hasChildren: false } },
  indexes: [
    {
      name: 'parent_fullname',
      properties: ['parentId', 'name', 'extension'],
      unique: true,
      normalized: true
    }
  ]
})
export class TreeFile extends TreeAdjacencyListEntityBase {
  name!: string;
  type!: 'file' | 'folder';
  extension!: string | null;
}

/**
 * `TreeMenu` —— 复刻 `MenuSimple` 的菜单树夹具。
 *
 * @remarks
 * 只有 `parentId` 可空，用来单独盯住「根节点同名」这一半 ——
 * 与 {@link TreeFile} 的「两个可空列」区分开，失败信号才不会混在一起。
 */
@TreeEntity({
  name: 'TreeMenu',
  tableName: 'tree_unique_menu',
  namespace: NAMESPACE,
  log: false,
  properties: [{ name: 'title', type: PropertyType.string, nullable: false }],
  features: { tree: { type: 'adjacency-list', hasChildren: false } },
  indexes: [
    {
      name: 'parent_title',
      properties: ['parentId', 'title'],
      unique: true,
      normalized: true
    }
  ]
})
export class TreeMenu extends TreeAdjacencyListEntityBase {
  title!: string;
}
