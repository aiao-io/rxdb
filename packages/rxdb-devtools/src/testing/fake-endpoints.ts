/**
 * @fileoverview 把 scenario 装配成一次真实的两端协议运行：panel 协商机 + connector v2 端点 + fake provider。
 *
 * @remarks
 * 它是 `json-driver` 与产品代码之间唯一的胶水。刻意**不含任何断言与协议判断**——一旦这里
 * 出现「若对端是 v1 就……」之类的分支，suite 验的就成了胶水的分支覆盖，而不是产品状态机。
 * 这里只做三件事：按 scenario 选端点形态、在 JSON 文本与对象之间翻译、把探针原样转交。
 *
 * v1 形态的两端是**故意最小**的：v1 panel 只对 legacy `HANDSHAKE` 回 legacy `HANDSHAKE_ACK`，
 * v1 connector 只发一条 eager legacy 握手。协议要求的降级路径，判定权全在被测的 v2 一侧，
 * 给 v1 桩加任何智能都会把结论搬到桩里。
 *
 * @module @aiao/rxdb-devtools/testing/fake-endpoints
 */

import { SequenceGenerator } from '../sequence.js';
import { createMessage, isDevToolsMessage } from '../types.js';
import type { AnyDevToolsMessage } from '../types.js';
import type { DevToolsProviderDescriptor } from '../provider/descriptor.js';
import { createDevToolsConnectorEndpoint } from '../v2/endpoint.js';
import { createPanelNegotiation } from '../v2/negotiation-panel.js';
import type { DevToolsConformanceScenario, DevToolsWireFrame } from './driver.js';
import { createFakeProviders } from './fake-providers.js';
import type { DevToolsFakeProviderKinds, DevToolsFakeProviderOptions } from './fake-providers.js';
import type { JsonDriverContext, JsonDriverEndpointFactory, JsonDriverEndpoints } from './json-driver.js';

/** connector 发出的那条 eager v1 握手；与 `connector.ts` 现有形状一致。 */
function legacyHandshake(): AnyDevToolsMessage {
  return createMessage('HANDSHAKE', 'page-to-devtools', null, 1);
}

/**
 * 尽力解析一帧。
 *
 * @remarks
 * 中继会原样转发注入的非 JSON 原文（wire hygiene 的负向用例正是这么来的），所以两端都必须
 * 能吃下不可解析的输入。返回 `undefined` 而不是抛错：解析失败在协议上等价于「不是本协议的帧」，
 * 而各状态机对非本协议输入的既定语义就是忽略。
 *
 * @param frame - 原文。
 * @returns 解析结果；不可解析时为 `undefined`。
 */
function parseFrame(frame: DevToolsWireFrame): unknown {
  try {
    return JSON.parse(frame) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * 由 scenario 的 descriptor 反推 fake provider 的装配参数。
 *
 * @remarks
 * scenario 给的是「期望对端看到的 descriptor」，fake provider 要的是「用哪些 kind 装配」。
 * 两者由 kind 一一对应，所以这里只取 kind 与 files 的 `maxTransferBytes`，其余字段
 * （operations / reason / runtime）仍由 fake provider 按 kind 现算——否则 scenario 就能
 * 手写一份与 kind 不自洽的 descriptor，AC#15「同 kind 必给同能力」就无从谈起。
 *
 * scenario 未给 descriptor 时装配三领域全可用的默认集，而不是空集：空集会让每个数据面用例
 * 都以 `provider_unsupported` 结束，整张矩阵变成同一条断言。
 *
 * @param scenario - 本次运行的条件。
 * @returns fake provider 的装配参数。
 */
function providerOptions(scenario: DevToolsConformanceScenario): DevToolsFakeProviderOptions {
  if (scenario.descriptors.length === 0) return { runtime: scenario.runtime };

  const kinds: DevToolsFakeProviderKinds = {};
  for (const descriptor of scenario.descriptors) kinds[descriptor.domain] = descriptor.kind;
  const files = scenario.descriptors.find((descriptor: DevToolsProviderDescriptor) => descriptor.domain === 'files');
  const limit = files === undefined || files.limits.maxTransferBytes === 0 ? {} : { maxTransferBytes: files.limits.maxTransferBytes };

  return { runtime: scenario.runtime, kinds, ...limit };
}

/** 只认 legacy 握手、只回 legacy ACK 的 v1 panel。 */
function createLegacyPanel(send: (frame: DevToolsWireFrame) => void): (frame: DevToolsWireFrame) => void {
  const sequence = new SequenceGenerator();
  return (frame: DevToolsWireFrame): void => {
    const parsed = parseFrame(frame);
    if (!isDevToolsMessage(parsed) || parsed.type !== 'HANDSHAKE') return;
    send(JSON.stringify(createMessage('HANDSHAKE_ACK', 'devtools-to-page', null, sequence.next())));
  };
}

/** 只发一条 eager legacy 握手、此后不再产出的 v1 connector。 */
function createLegacyConnector(send: (frame: DevToolsWireFrame) => void): (frame: DevToolsWireFrame) => void {
  send(JSON.stringify(legacyHandshake()));
  return (): void => undefined;
}

/**
 * 建一个按 scenario 现装配两端的端点工厂。
 *
 * @remarks
 * 两端都在 `attach` 回调里立刻 `start()`：driver 接口没有单独的启动钩子，而
 * `json-driver` 先 attach panel 后 attach connector，这恰好就是 AC#2 要求的
 * 「panel 先起、connector 后到」——投递是异步的，connector 在第一条 HELLO 落地前已就位。
 *
 * @returns 可直接交给 {@link createJsonConformanceDriver} 的工厂。
 */
export function createFakeEndpointFactory(): JsonDriverEndpointFactory {
  return (context: JsonDriverContext): JsonDriverEndpoints => {
    const { scenario, clock } = context;
    const providers = createFakeProviders(providerOptions(scenario));
    const disposers: (() => void)[] = [];

    const panel = (send: (frame: DevToolsWireFrame) => void): ((frame: DevToolsWireFrame) => void) => {
      if (scenario.panelProtocol === 'v1') return createLegacyPanel(send);

      const negotiation = createPanelNegotiation({
        send: message => {
          send(JSON.stringify(message));
        },
        clock
      });
      negotiation.start();
      disposers.push(() => {
        negotiation.dispose();
      });
      return (frame: DevToolsWireFrame): void => {
        negotiation.receive(parseFrame(frame));
      };
    };

    const connector = (send: (frame: DevToolsWireFrame) => void): ((frame: DevToolsWireFrame) => void) => {
      if (scenario.connectorProtocol === 'v1') return createLegacyConnector(send);

      const endpoint = createDevToolsConnectorEndpoint({
        send: message => {
          send(JSON.stringify(message));
        },
        clock,
        capability: scenario.capability,
        mutationPolicy: scenario.mutationPolicy,
        providers,
        legacyHandshake: legacyHandshake()
      });
      endpoint.start();
      disposers.push(() => {
        endpoint.dispose();
      });
      return (frame: DevToolsWireFrame): void => {
        endpoint.receive(parseFrame(frame));
      };
    };

    return {
      panel,
      connector,
      provider: providers.probe,
      dispose: () => {
        for (const dispose of disposers) dispose();
      }
    };
  };
}
