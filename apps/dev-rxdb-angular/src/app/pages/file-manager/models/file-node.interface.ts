import type { RxDBEntityId } from '@aiao/rxdb';
import type { Observable } from 'rxjs';

interface FileParentRelation<T> {
  set(parent: T | null): void;
}

export interface FileTreeEntity {
  id: string;
  name: string;
  type: 'file' | 'folder';
  parentId?: string | null;
  sortOrder?: string | null;
  extension?: string | null;
  size?: number | null;
  hasChildren?: boolean | null;
  parent$: FileParentRelation<this>;
  save: () => Promise<this>;
  remove: () => Promise<this>;
}

export interface FileTreeEntityConstructor {
  new (...args: never[]): FileTreeEntity;
  find(options: object): Observable<InstanceType<this>[]>;
  findAll(options: object): Observable<InstanceType<this>[]>;
  /** 树查询：指定 `entityId` 时返回该节点自身与全部后代。 */
  findDescendants(options: { entityId: RxDBEntityId }): Observable<InstanceType<this>[]>;
}

export type FileTreeInstance<T extends FileTreeEntityConstructor> = InstanceType<T>;

/**
 * TreeNode - 树形视图节点
 * 包含实体数据和视图状态
 */
export interface TreeNode<T extends FileTreeEntity = FileTreeEntity> {
  node: T;
  level: number;
  isExpanded: boolean;
  hasChildren: boolean;
  isMatched?: boolean;
  dragState?: 'drag-over-before' | 'drag-over-inside' | 'drag-over-after' | 'invalid-target' | null;
}
