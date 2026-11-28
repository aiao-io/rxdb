/**
 * 桩客户端用的测试令牌（US-225）：适配器订阅变更通知前只读令牌载荷里的 `role`，不校验签名，
 * 所以这里只拼出形状正确的 JWT。
 */
export function testJwt(claims: Record<string, unknown>): string {
  return `${btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${btoa(JSON.stringify(claims))}.signature`;
}

/** 已登录用户的令牌：适配器会订阅变更通知 */
export const SIGNED_IN_TOKEN = testJwt({ role: 'authenticated', sub: 'test-user' });
