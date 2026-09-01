/**
 * @fileoverview Tauri thin driver 的 conformance：同一份 suite，中继换成 Tauri 的透明定向中继。
 *
 * @remarks
 * 与 `packages/rxdb-devtools/src/__tests__/testing/conformance.spec.ts` 的差别**只有一个
 * `createNodes`**。判据、fixture、状态机断言、错误码表一行都没有复制过来——这正是 US-904
 * AC#44 / US-905 AC#7 要的结构：Tauri 只适配 transport，不复制 panel、provider 类型、fixture、
 * 错误码或状态机。
 *
 * 覆盖到的是 AC#2 / AC#7 里「transport 那一半」：safe-integer guard、decoded-byte 限额、
 * 穷举错误、transfer/snapshot 状态机、session 轮换、资源释放在 JSON 定向中继上全部不变。
 * **没有**覆盖「真实 Rust 命令 / 双 WebView」那一半（`invoke` / `listen` 的跨窗口投递、
 * 窗口关闭/重开）——那要一个真实 Tauri 窗口，见 US-905 AC#8 的 e2e。
 */

import {
  createFakeEndpointFactory,
  createJsonConformanceDriver,
  runDevToolsControlPlaneSuite,
  runDevToolsDataPlaneSuite
} from '@aiao/rxdb-devtools/testing';
import { createTauriRelayNodes } from './tauri-relay-nodes';

const driver = createJsonConformanceDriver(createFakeEndpointFactory(), {
  name: 'tauri',
  createNodes: createTauriRelayNodes()
});

runDevToolsControlPlaneSuite(driver);
runDevToolsDataPlaneSuite(driver);
