import type { ITreeEntity } from '@aiao/rxdb';
import type { Observable } from 'rxjs';

/** 菜单树操作需要的实体能力。 */
export interface TreeMenuEntity extends ITreeEntity {
  title: string;
  sortOrder?: string | null;
  hasChildren?: boolean | null;
  save: () => Promise<this>;
  remove: () => Promise<this>;
}

/** 带生成器静态类型的菜单实体构造器。 */
export interface TreeMenuEntityConstructor {
  new (...args: never[]): TreeMenuEntity;
  findAll(options: object): Observable<InstanceType<this>[]>;
}

export type TreeMenuInstance<T extends TreeMenuEntityConstructor> = InstanceType<T>;

/**
 * 树节点视图模型
 * 包含 Menu 实体及其展示状态
 */
export interface TreeNode<T extends ITreeEntity = TreeMenuEntity> {
  /** 菜单实体数据 */
  menu: T;

  /** 节点层级（根节点为 0，子节点递增） */
  level: number;

  /** 是否展开（所有节点都可以有子节点） */
  isExpanded: boolean;

  /** 是否有子节点（用于显示展开/折叠图标） */
  hasChildren: boolean;

  /** 是否为搜索匹配项（用于高亮显示） */
  isMatched?: boolean;

  /** 完整路径（用于冲突检测和面包屑导航） */
  fullPath?: string;
}
