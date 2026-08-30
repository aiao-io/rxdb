/**
 * @fileoverview 中继（background service worker + content script）唯一需要的协议判定：
 * 「这是不是本协议的帧、往哪个方向走」。
 *
 * @remarks
 * **为什么中继不能继续只认 v1。** `isDevToolsMessage` 是对 v1 `type` 的穷举 switch，遇到
 * `PROTOCOL_HELLO` / `REQUEST` / `TRANSFER_CHUNK` 一律 `return false`；v2 的方向标签
 * （`panel-to-connector` / `connector-to-panel`）也不在它的方向枚举里。也就是说：**在中继换成
 * 宽外层判定之前，v2 帧一条都过不去**。US-904 阶段 B 冻结的那套协商、授权与传输状态机，
 * 在 Chrome 上因此是死的——这正是阶段 C2 要修的第一件事。
 *
 * **为什么是宽外层而不是完整校验。** 中继只需要回答「转不转、往哪转」。让它持有全部 payload
 * schema 会带来一个必然错位的升级顺序：service worker 与页面里的 connector 是**分别**更新的
 * （前者随扩展升级，后者随页面刷新），中继一旦严校验 payload，就会在任一侧先升级时把对方的
 * 合法帧判非法——而且是静默丢弃，两端都看不出发生了什么。严校验的位置在两个端点上
 * （`isDevToolsMessage` 与 `isDevToolsV2Message`），它们本来就必须做。
 *
 * **为什么返回方向而不是布尔。** 原来的中继在每个转发点各写一次
 * `message.direction === 'page-to-devtools'`。加上 v2 的两个方向标签后，那种写法要在四处
 * 各展开成一个二选一的或表达式，任何一处漏改都表现为「某个方向的 v2 帧被静默吞掉」。
 * 把方向判定收成一个函数，漏改就变成编译错误。
 *
 * @module @modules/rxdb-devtools-panel/wire/relay
 */

import { isDevToolsV2Envelope, type DevToolsV2EnvelopeShape } from '@aiao/rxdb-devtools';
import { isDevToolsMessage, type DevToolsMessage } from './types';

/**
 * 中继上流通的一帧：v1 信封或 v2 信封。
 *
 * @remarks
 * 这个联合类型**没有共同的 payload 契约**，这正是它想表达的：中继不解释 payload。
 * 两代信封唯一共有且中继确实要用的字段是 `type`（日志与错误上报），联合类型自然给出它。
 */
export type DevToolsRelayFrame = DevToolsMessage | DevToolsV2EnvelopeShape;

/**
 * 帧在四段中继上的传播方向。
 *
 * @remarks
 * 刻意用中继自己的词汇（page / panel）而不是复用 v1 或 v2 的方向标签：两代协议的标签不同名，
 * 中继却只有一条链路。用第三套名字，能让「把 v1 的标签当成 v2 的标签用」这类错误在类型层面
 * 就写不出来。
 */
export type DevToolsRelayDirection = 'to-page' | 'to-panel';

/**
 * 判定一帧的中继方向。
 *
 * @remarks
 * 两代协议各自用**自己的**外层守卫，不做形状上的合并：v1 的守卫是 exact-key 严校验，
 * v2 的 {@link isDevToolsV2Envelope} 只看信封。合并成一条自制规则等于在中继里再实现一遍协议，
 * 那份实现必然与两个端点漂移。
 *
 * @param value - 来自 port、`chrome.runtime` 或 `window` 总线的未校验值。
 * @returns 帧的传播方向；不属于本协议时为 `null`。
 */
export function relayDirectionOf(value: unknown): DevToolsRelayDirection | null {
  if (isDevToolsMessage(value)) {
    return value.direction === 'page-to-devtools' ? 'to-panel' : 'to-page';
  }
  if (isDevToolsV2Envelope(value)) {
    return value.direction === 'connector-to-panel' ? 'to-panel' : 'to-page';
  }
  return null;
}

/**
 * 判定一帧是否为本协议的帧**且**朝向给定方向。
 *
 * @remarks
 * 这是四个转发点唯一应该调用的入口，理由是类型收窄：转发点需要读 `type` 来记日志和上报错误，
 * 若只有 {@link relayDirectionOf} 返回方向、值仍是 `unknown`，每个转发点都会长出一次
 * `as DevToolsMessage` —— 而那次强转会把「中继其实只认 v1」这件事重新藏起来，
 * 且在运行时对 v2 帧完全无声。
 *
 * `direction` 是必填参数而非默认值：中继的四个转发点方向各不相同，省略即错。
 *
 * @param value - 未校验值。
 * @param direction - 该转发点允许通过的方向。
 * @returns 是本协议帧且方向匹配时为 `true`，并把 `value` 收窄为 {@link DevToolsRelayFrame}。
 */
export function isRelayFrameTowards(value: unknown, direction: DevToolsRelayDirection): value is DevToolsRelayFrame {
  return relayDirectionOf(value) === direction;
}

/**
 * 判定一帧是否为**任一代**协议的上行 `HANDSHAKE`。
 *
 * @remarks
 * 端口采纳（content script 从 HANDSHAKE 上取走 `MessagePort`）对两代协议是同一件事：
 * 私有信道的建立与协议版本无关。用 `type` 而不是版本判别位来识别，正是为了让 v2 connector
 * 不必为了拿到私有端口而伪装成 v1。
 *
 * 只认上行：一条自称 `HANDSHAKE` 的下行帧只可能来自伪造，而握手的方向在两代协议里都是
 * 页面 → 面板。
 *
 * @param value - 未校验值。
 * @returns 是上行握手帧时为 `true`。
 */
export function isRelayHandshake(value: unknown): boolean {
  if (isDevToolsMessage(value)) return value.direction === 'page-to-devtools' && value.type === 'HANDSHAKE';
  if (isDevToolsV2Envelope(value)) return value.direction === 'connector-to-panel' && value.type === 'HANDSHAKE';
  return false;
}
