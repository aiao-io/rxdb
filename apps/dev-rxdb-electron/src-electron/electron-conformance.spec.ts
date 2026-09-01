/**
 * @fileoverview Electron thin driver 的 conformance：同一份 suite，中继换成 Electron 的透明定向中继。
 *
 * @remarks
 * 与 `packages/rxdb-devtools/src/__tests__/testing/conformance.spec.ts` 的差别**只有一个
 * `createNodes`**。判据、fixture、状态机断言、错误码表一行都没有复制过来——这正是 US-904
 * AC#44 / AC#53 要的结构：Electron 只适配 transport，不复制 panel、provider 类型、fixture、
 * 错误码或状态机。
 *
 * 覆盖到的是 AC#53 里「transport 那一半」：控制面、descriptor、base64、safe-integer、授权、
 * 传输、快照、错误映射与 session 轮换在 Electron 定向中继上全部不变。**没有**覆盖「真实
 * `ipcRenderer.invoke` / preload contextBridge / 桌面 host」那一半——那是 AC#50 的主进程 host
 * 单测与 AC#52 的真实 E2E（真实临时 userData + desktop SQLite + 原生文件 + 应用重启）。
 */

import {
  createFakeEndpointFactory,
  createJsonConformanceDriver,
  runDevToolsControlPlaneSuite,
  runDevToolsDataPlaneSuite
} from '@aiao/rxdb-devtools/testing';
import { createElectronRelayNodes } from './electron-relay-nodes';

const driver = createJsonConformanceDriver(createFakeEndpointFactory(), {
  name: 'electron',
  createNodes: createElectronRelayNodes()
});

runDevToolsControlPlaneSuite(driver);
runDevToolsDataPlaneSuite(driver);
