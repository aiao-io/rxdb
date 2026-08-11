import type { RxDBEntityId } from '@aiao/rxdb';
import { MenuLarge, MenuSimple } from '@aiao/rxdb-test/entities';

/**
 * 菜单操作类型
 */
export enum MenuOperationType {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  MOVE = 'MOVE',
  REORDER = 'REORDER'
}

/**
 * 操作快照（用于撤销/重做）
 */
export interface MenuOperationSnapshot {
  /** 操作类型 */
  type: MenuOperationType;

  /** 操作描述（用于 UI 显示） */
  description: string;

  /** 操作时间戳 */
  timestamp: number;

  /** 受影响的菜单 ID 列表 */
  affectedMenuIds: RxDBEntityId[];

  /** 操作前的数据快照（用于撤销） */
  beforeState: Partial<MenuSimple | MenuLarge>[];

  /** 操作后的数据快照（用于重做） */
  afterState: Partial<MenuSimple | MenuLarge>[];
}

/**
 * Command 接口（命令模式）
 */
export interface MenuCommand {
  /** 执行操作 */
  execute(): Promise<void>;

  /** 撤销操作 */
  undo(): Promise<void>;

  /** 操作描述 */
  description: string;

  /** 操作快照（可选，用于调试和审计） */
  snapshot?: MenuOperationSnapshot;
}
