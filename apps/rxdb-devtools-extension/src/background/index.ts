import { logger } from '@modules/rxdb-devtools-panel/wire';
import bridgeScript from '../content/bridge.ts?script';
import opfsScript from '../content/opfs-content.ts?script';
import { createBackgroundController } from './background-core';

const controller = createBackgroundController({
  injectIntoTab: tabId =>
    chrome.scripting
      .executeScript({
        files: [bridgeScript, opfsScript],
        target: { tabId }
      })
      .then(() => undefined),
  sendToTab: (tabId, message) => chrome.tabs.sendMessage(tabId, message),
  onError: (type, error) => logger.debug(`Failed to send ${type}`, { error })
});

chrome.runtime.onConnect.addListener(port => controller.connect(port));
chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  // P1-3：只接受**本扩展自己的主帧** content script。
  // 早先完全不看 `sender`：`chrome.runtime.onMessage` 会收到任何声明了
  // `externally_connectable` 的来源、以及被检查页面里任意 iframe 的消息，
  // 而下游只按 tabId 路由。当前 `executeScript` 未设 `allFrames`（默认仅主帧），
  // 属于「恰好不可利用」的隐式保护 —— 一旦将来改成注入所有帧，这里就是缺口。
  if (sender.id !== chrome.runtime.id) return;
  if (sender.frameId !== 0) return;
  controller.receiveContent(message, sender.tab?.id);
});
