/**
 * @fileoverview 面板四个宿主 token 的纯内存实现，供 library 自身的装配测试使用。
 *
 * @remarks
 * **不从 `src/index.ts` 导出、也不进 lib 构建**（见 `tsconfig.lib.json` 的 `exclude`）：
 * 它们是测试基础设施，混进产物只会给宿主一条绕过真实 adapter 的暗道。
 */

import { Provider } from '@angular/core';
import { DEVTOOLS_FILE_CHANNEL, DEVTOOLS_HOST_ACCESS, DEVTOOLS_PANEL_VERSION, DEVTOOLS_TRANSPORT } from '../transport';
import { FakeDevToolsFileChannel } from './fake-file-channel';
import { FakeDevToolsHostAccess } from './fake-host-access';
import { FakeDevToolsTransport } from './fake-transport';

export { FakeDevToolsFileChannel, type FakeOpfsResponder } from './fake-file-channel';
export { FakeDevToolsHostAccess } from './fake-host-access';
export { FakeDevToolsTransport, type RecordedMessage } from './fake-transport';

/** 一次装配所用的全部 fake 实例，便于用例直接断言。 */
export interface FakePanelHost {
  transport: FakeDevToolsTransport;
  hostAccess: FakeDevToolsHostAccess;
  fileChannel: FakeDevToolsFileChannel;
  version: string;
  providers: Provider[];
}

/** 组装一套完整的 fake 宿主 provider。 */
export function createFakePanelHost(version = '0.0.0-test'): FakePanelHost {
  const transport = new FakeDevToolsTransport();
  const hostAccess = new FakeDevToolsHostAccess();
  const fileChannel = new FakeDevToolsFileChannel();
  return {
    transport,
    hostAccess,
    fileChannel,
    version,
    providers: [
      { provide: DEVTOOLS_TRANSPORT, useValue: transport },
      { provide: DEVTOOLS_HOST_ACCESS, useValue: hostAccess },
      { provide: DEVTOOLS_FILE_CHANNEL, useValue: fileChannel },
      { provide: DEVTOOLS_PANEL_VERSION, useValue: version }
    ]
  };
}
