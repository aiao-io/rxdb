import { Account } from './Account.js';
import { Article } from './Article.js';
import { AuditLog } from './AuditLog.js';
import { Comment } from './Comment.js';
import { Contract } from './Contract.js';
import { FileLarge } from './FileLarge.js';
import { FileNode } from './FileNode.js';
import { Invoice } from './Invoice.js';
import { MenuLarge } from './MenuLarge.js';
import { MenuSimple } from './MenuSimple.js';
import { SortableFileLarge } from './SortableFileLarge.js';
import { SortableFileNode } from './SortableFileNode.js';
import { SortableMenuLarge } from './SortableMenuLarge.js';
import { SortableMenuSimple } from './SortableMenuSimple.js';
import { Task } from './Task.js';
import { TenantNote } from './TenantNote.js';
import { Todo } from './Todo.js';
import { TypeDemo } from './TypeDemo.js';
import { TypeDemoNative } from './TypeDemoNative.js';

export { Account } from './Account.js';
export { Article } from './Article.js';
export { AuditLog } from './AuditLog.js';
// 按授权分区同步与规则之外的公开浏览（US-033 / US-036）：两者都要连 Supabase，不进 ENTITIES，
// 免得纯本地的 demo 把 QueryCache 实体一起注册
export { CatalogItem } from './CatalogItem.js';
export { Comment } from './Comment.js';
export { Contract } from './Contract.js';
export { FileLarge } from './FileLarge.js';
export { FileNode } from './FileNode.js';
export { Invoice } from './Invoice.js';
export { MenuLarge } from './MenuLarge.js';
export { MenuSimple } from './MenuSimple.js';
export { PublicCatalogItem } from './PublicCatalogItem.js';
export { SortableFileLarge } from './SortableFileLarge.js';
export { SortableFileNode } from './SortableFileNode.js';
export { SortableMenuLarge } from './SortableMenuLarge.js';
export { SortableMenuSimple } from './SortableMenuSimple.js';
export { Task } from './Task.js';
export { TenantNote } from './TenantNote.js';
export { Todo } from './Todo.js';
export { TypeDemo } from './TypeDemo.js';
export { TypeDemoNative } from './TypeDemoNative.js';

export const ENTITIES = [
  Account,
  Article,
  AuditLog,
  Comment,
  Contract,
  FileLarge,
  FileNode,
  Invoice,
  MenuLarge,
  MenuSimple,
  SortableFileLarge,
  SortableFileNode,
  SortableMenuLarge,
  SortableMenuSimple,
  Task,
  TenantNote,
  Todo,
  TypeDemo,
  TypeDemoNative
];
