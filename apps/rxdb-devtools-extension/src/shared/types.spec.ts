import { describe, expect, it } from 'vitest';
import { isDevToolsMessage, RXDB_DEVTOOLS_MESSAGE } from './types';

describe('isDevToolsMessage', () => {
  /**
   * P0-1：这条原先写的是 `type: 'EVENT'` + `payload: null` 也算合法 ——
   * **它守着的正是被修掉的那个缺陷**（松校验不看 payload 形状）。
   * 严校验下 `EVENT` 的 payload 必须是 `SerializedEvent`，所以这里补上真实形状。
   */
  it('accepts a well-formed message', () => {
    const envelope = { source: RXDB_DEVTOOLS_MESSAGE, payload: null, timestamp: 1, sequence: 1 };
    expect(
      isDevToolsMessage({
        ...envelope,
        direction: 'page-to-devtools',
        type: 'EVENT',
        payload: { id: 'e1', eventType: 'insert', timestamp: 1, sequence: 1, data: {} }
      })
    ).toBe(true);
    expect(isDevToolsMessage({ ...envelope, direction: 'devtools-to-page', type: 'PING' })).toBe(true);
  });

  it('rejects a wrong source', () => {
    expect(isDevToolsMessage({ source: 'other', direction: 'page-to-devtools', type: 'EVENT' })).toBe(false);
  });

  it('rejects an invalid direction', () => {
    expect(isDevToolsMessage({ source: RXDB_DEVTOOLS_MESSAGE, direction: 'sideways', type: 'EVENT' })).toBe(false);
  });

  it('rejects a missing or non-string type', () => {
    expect(isDevToolsMessage({ source: RXDB_DEVTOOLS_MESSAGE, direction: 'page-to-devtools' })).toBe(false);
    expect(isDevToolsMessage({ source: RXDB_DEVTOOLS_MESSAGE, direction: 'page-to-devtools', type: 5 })).toBe(false);
  });

  it('rejects unknown types and incomplete envelopes', () => {
    const envelope = {
      source: RXDB_DEVTOOLS_MESSAGE,
      direction: 'page-to-devtools',
      payload: null,
      timestamp: 1,
      sequence: 1
    };
    expect(isDevToolsMessage({ ...envelope, type: 'UNKNOWN' })).toBe(false);
    expect(isDevToolsMessage({ ...envelope, type: 'EVENT', timestamp: undefined })).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isDevToolsMessage(null)).toBe(false);
    expect(isDevToolsMessage('x')).toBe(false);
    expect(isDevToolsMessage(undefined)).toBe(false);
  });
});

describe('isDevToolsMessage —— 严格协议校验（P0-1）', () => {
  const envelope = { source: RXDB_DEVTOOLS_MESSAGE, payload: null, timestamp: 1, sequence: 1 };

  /**
   * P0-1：扩展自建了一个**同名**的 `isDevToolsMessage`，只校验 envelope，
   * 把核心库 `@aiao/rxdb-devtools` 的严校验整个遮住了 ——
   * 而下游全部 `as` 盲转（`message.payload as { message: string }` 之类）。
   * 结果是页面里任意脚本都能用畸形 payload 打崩面板。
   *
   * 核心库的严校验本来就检查三件事：envelope 精确键、direction↔type 配对、逐类型 payload 形状。
   * 这一组用例把这三件事钉在扩展这一侧。
   */
  it('拒绝 direction 与 type 不配对的消息', () => {
    // HANDSHAKE 只能是 page-to-devtools
    expect(isDevToolsMessage({ ...envelope, direction: 'devtools-to-page', type: 'HANDSHAKE' })).toBe(false);
    // PING 只能是 devtools-to-page
    expect(isDevToolsMessage({ ...envelope, direction: 'page-to-devtools', type: 'PING' })).toBe(false);
  });

  it('拒绝 payload 形状不对的消息', () => {
    // EVENT 的 payload 必须是 SerializedEvent，不能是 null
    expect(isDevToolsMessage({ ...envelope, direction: 'page-to-devtools', type: 'EVENT' })).toBe(false);
    // SWITCH_BRANCH 的 payload 必须是非空字符串
    expect(isDevToolsMessage({ ...envelope, direction: 'devtools-to-page', type: 'SWITCH_BRANCH' })).toBe(false);
    expect(isDevToolsMessage({ ...envelope, direction: 'devtools-to-page', type: 'SWITCH_BRANCH', payload: '' })).toBe(
      false
    );
    expect(
      isDevToolsMessage({ ...envelope, direction: 'devtools-to-page', type: 'SWITCH_BRANCH', payload: 'main' })
    ).toBe(true);
  });

  it('拒绝夹带额外键的消息', () => {
    expect(isDevToolsMessage({ ...envelope, direction: 'devtools-to-page', type: 'PING', evil: 'extra' })).toBe(false);
  });

  it('拒绝非法 tabId', () => {
    expect(isDevToolsMessage({ ...envelope, direction: 'devtools-to-page', type: 'PING', tabId: -1 })).toBe(false);
    expect(isDevToolsMessage({ ...envelope, direction: 'devtools-to-page', type: 'PING', tabId: 1.5 })).toBe(false);
    expect(isDevToolsMessage({ ...envelope, direction: 'devtools-to-page', type: 'PING', tabId: 7 })).toBe(true);
  });

  // 会话令牌随协议 v2 的私有 MessagePort 一起删掉了：端口本身就是信道身份。
  // envelope 必须重新拒绝 `session`，否则它就是一个可夹带的额外键。
  it('拒绝令牌协议遗留的 session 键', () => {
    expect(isDevToolsMessage({ ...envelope, direction: 'devtools-to-page', type: 'PING', session: 'tok-1' })).toBe(
      false
    );
    expect(
      isDevToolsMessage({
        ...envelope,
        direction: 'devtools-to-page',
        type: 'SWITCH_BRANCH',
        payload: 'main',
        session: 'tok-1'
      })
    ).toBe(false);
  });

  describe('扩展自有类型（核心库不认识，必须由扩展这侧同等严格地校验）', () => {
    /**
     * P1-4：`INIT` 原先是一个**绕过协议的裸对象** `{ type: 'INIT', tabId }` ——
     * 没有 source / direction / timestamp / sequence，且 `'INIT'` 不在类型白名单里。
     * 它必须先被正规化，严校验才能启用而不把握手打断。
     */
    it('INIT 必须是完整协议消息', () => {
      expect(isDevToolsMessage({ type: 'INIT', tabId: 7 })).toBe(false);
      expect(isDevToolsMessage({ ...envelope, direction: 'devtools-to-page', type: 'INIT', tabId: 7 })).toBe(true);
      // 方向必须是面板 → 页面侧
      expect(isDevToolsMessage({ ...envelope, direction: 'page-to-devtools', type: 'INIT', tabId: 7 })).toBe(false);
      // INIT 必须带 tabId
      expect(isDevToolsMessage({ ...envelope, direction: 'devtools-to-page', type: 'INIT' })).toBe(false);
    });

    it('INSPECTED_WINDOW_SCRIPT_RESULT 的 payload 形状被校验', () => {
      const base = { ...envelope, direction: 'page-to-devtools' as const, type: 'INSPECTED_WINDOW_SCRIPT_RESULT' };
      expect(isDevToolsMessage({ ...base, payload: { requestId: 'r1', success: true, result: 42 } })).toBe(true);
      expect(isDevToolsMessage({ ...base, payload: { requestId: 'r1', success: false, error: 'boom' } })).toBe(true);
      // 缺 requestId / success 类型不对 / payload 不是对象，一律拒绝
      expect(isDevToolsMessage({ ...base, payload: { success: true } })).toBe(false);
      expect(isDevToolsMessage({ ...base, payload: { requestId: 'r1', success: 'yes' } })).toBe(false);
      expect(isDevToolsMessage({ ...base, payload: null })).toBe(false);
    });

    it('ERROR 的 payload 必须带 message 字符串', () => {
      const base = { ...envelope, direction: 'page-to-devtools' as const, type: 'ERROR' };
      expect(isDevToolsMessage({ ...base, payload: { message: 'query failed' } })).toBe(true);
      expect(isDevToolsMessage({ ...base, payload: {} })).toBe(false);
      expect(isDevToolsMessage({ ...base, payload: null })).toBe(false);
    });

    it('BRANCH_* 是无 payload 的通知', () => {
      for (const type of ['BRANCH_SWITCHED', 'BRANCH_CREATED', 'BRANCH_DELETED']) {
        expect(isDevToolsMessage({ ...envelope, direction: 'page-to-devtools', type })).toBe(true);
        expect(isDevToolsMessage({ ...envelope, direction: 'devtools-to-page', type })).toBe(false);
      }
    });
  });
});
