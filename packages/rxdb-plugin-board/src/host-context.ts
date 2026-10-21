import type { UUID } from '@aiao/rxdb';

import { BoardDomainError } from './errors.js';

/**
 * 看板宿主上下文（US-526 技术笔记「恢复中」是共同写门禁）。
 *
 * @remarks
 * 宿主注入当前板与「是否正处于恢复」；状态由宿主注入而不是服务自持，
 * 服务层用例不依赖 UI 即可验收（US-526 AC#10）。单人版没有只读宿主，
 * 只读、登录与成员资格由 US-533 加入同一判定。
 */
export interface BoardHostContext {
  /** 当前板 id；尚未选板（启动选择阶段）为 `null`。 */
  readonly boardId: UUID | null;
  /** 任一页面开始恢复即进入；恢复失败解除后恢复可写。 */
  readonly restoring: boolean;
}

/**
 * 恢复中写门禁：全部应用写入口（创建 / 编辑 / 删除 / 移动 / 本列排序 /
 * 撤销重做 / 再次恢复）在领域服务层先过这一关（US-526 AC#10）。
 */
export const assertBoardWritable = (ctx: BoardHostContext): void => {
  if (ctx.restoring) {
    throw new BoardDomainError('restore_in_progress', '恢复进行中，暂不可写入');
  }
};

/** 取当前板 id：无板时报 `board_not_found`。 */
export const requireBoardId = (ctx: BoardHostContext): UUID => {
  if (ctx.boardId === null) {
    throw new BoardDomainError('board_not_found', '当前没有打开的看板');
  }
  return ctx.boardId;
};
