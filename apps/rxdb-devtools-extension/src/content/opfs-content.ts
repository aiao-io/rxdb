import { isOpfsRequest } from '@modules/rxdb-devtools-panel/wire';
import { createOpfsMessageHandler } from './opfs';

const handleMessage = createOpfsMessageHandler({
  getRootDirectory: () => navigator.storage.getDirectory()
});

const opfsWindow = window as Window & { __AIAO_RXDB_DEVTOOLS_OPFS__?: boolean };

if (!opfsWindow.__AIAO_RXDB_DEVTOOLS_OPFS__) {
  opfsWindow.__AIAO_RXDB_DEVTOOLS_OPFS__ = true;
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (!isOpfsRequest(request)) return false;
    // P2-4：`handleMessage` 内部全 catch，唯一抛错来源是 channel 已关闭时的 `sendResponse` 本身。
    // 少了这个 catch，面板一关就会留下 unhandled rejection。
    void handleMessage(request)
      .then(sendResponse)
      .catch((cause: unknown) => {
        console.warn('[rxdb-devtools] OPFS 响应发送失败（面板可能已关闭）', cause);
      });
    return true;
  });
}
