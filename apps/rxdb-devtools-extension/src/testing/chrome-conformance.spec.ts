/**
 * @fileoverview Chrome thin driver 的 conformance：同一份 suite，中继换成真实实现。
 *
 * @remarks
 * 与 `packages/rxdb-devtools/src/__tests__/testing/conformance.spec.ts` 的差别**只有一个
 * `createNodes`**。判据、fixture、状态机断言、错误码表一行都没有复制过来 —— 这就是
 * US-904 AC#44 要的结构：平台副本不是被禁止的，是没地方写。
 *
 * 覆盖到的是 AC#36 里「中继逻辑」那一半：真实 background 决不代 `HANDSHAKE_ACK`、
 * 两代帧共用同一条链路、方向相反的帧被丢弃、只建立一个 session。
 * **没有**覆盖「真实 Port」那一半（`chrome.runtime.connect` / `chrome.tabs.sendMessage`
 * 的跨进程投递、service worker 重启、页面刷新）—— 那要一个尚不存在的扩展 e2e，
 * 见 US-904 AC#38 / #39。
 */

import {
  createFakeEndpointFactory,
  createJsonConformanceDriver,
  runDevToolsControlPlaneSuite,
  runDevToolsDataPlaneSuite
} from '@aiao/rxdb-devtools/testing';
import { createChromeRelayNodes } from './chrome-relay-nodes';

const driver = createJsonConformanceDriver(createFakeEndpointFactory(), {
  name: 'chrome',
  createNodes: createChromeRelayNodes()
});

runDevToolsControlPlaneSuite(driver);
runDevToolsDataPlaneSuite(driver);
