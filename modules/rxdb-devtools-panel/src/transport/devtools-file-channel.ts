import { InjectionToken } from '@angular/core';
import type { OpfsRequest, OpfsResponse } from '@modules/rxdb-devtools-panel/wire';

/**
 * 面板与文件后端之间的**平台中立**文件信道。
 *
 * @remarks
 * 请求 id 与上传会话 id 的铸造刻意留给 adapter：Chrome 侧要把 tabId 掺进去才能在多标签页
 * 之间保持唯一，而 tabId 是面板不该认识的宿主概念。adapter 同时负责 requestId 配对校验
 * （见 `withOpfsRequestId`）—— 铸造与校验放在同一侧，才不会出现「一侧换了铸造规则、
 * 另一侧还在按旧规则配对」的漂移。
 */
export interface DevToolsFileChannel {
  /**
   * 发送一条 OPFS 请求并等待应答。
   *
   * @param message - 不含 `requestId` 的请求；id 由实现铸造并负责配对校验
   * @throws 应答 `requestId` 不匹配、或宿主信道不可用时抛出错误
   */
  request(message: Omit<OpfsRequest, 'requestId'>): Promise<OpfsResponse>;

  /** 铸造一个在本宿主内唯一的上传会话 id。 */
  createUploadId(): string;
}

/** {@link DevToolsFileChannel} 的注入令牌。 */
export const DEVTOOLS_FILE_CHANNEL = new InjectionToken<DevToolsFileChannel>('DEVTOOLS_FILE_CHANNEL');
