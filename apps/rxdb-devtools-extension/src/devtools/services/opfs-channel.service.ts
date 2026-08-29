import { Injectable } from '@angular/core';
import type { DevToolsFileChannel } from '@modules/rxdb-devtools-panel';
import { withOpfsRequestId, type OpfsRequest, type OpfsResponse } from '@modules/rxdb-devtools-panel/wire';

/**
 * {@link DevToolsFileChannel} 的 Chrome 实现：面板 → OPFS content script 的 `chrome.tabs.sendMessage` 通道。
 *
 * @remarks
 * 请求 id 与上传会话 id 都掺进 tabId：同一个扩展可能同时开着多个 DevTools 面板，
 * 只用自增序号会让两个面板铸出同名 id，而 content script 是按 id 认会话的。
 * 铸造与 `withOpfsRequestId` 的配对校验放在同一侧，规则不会单边漂移。
 */
@Injectable({ providedIn: 'root' })
export class OpfsChannelService implements DevToolsFileChannel {
  private requestSequence = 0;
  private uploadSequence = 0;

  request(message: Omit<OpfsRequest, 'requestId'>): Promise<OpfsResponse> {
    return withOpfsRequestId(
      message,
      request => chrome.tabs.sendMessage(chrome.devtools.inspectedWindow.tabId, request) as Promise<OpfsResponse>,
      () => `${chrome.devtools.inspectedWindow.tabId}:${++this.requestSequence}`
    );
  }

  createUploadId(): string {
    return `${chrome.devtools.inspectedWindow.tabId}:upload:${++this.uploadSequence}`;
  }
}
