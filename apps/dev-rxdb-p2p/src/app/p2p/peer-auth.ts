/**
 * 会话 hello 的凭据校验：票据验签、绑定这条连接、未过期，而且属于信令服务为这条连接宣布的那个对端。
 *
 * @remarks
 * 最后一条不能省：本端的票据会在 hello 里交给对端，只验签名与 connectionId 的话，
 * 对端把本端的票据原样回送就能冒充本端。
 */
import type { P2PPrincipal } from '@aiao/rxdb-plugin-p2p';
import { ticketPrincipal, verifyConnectionTicket } from '../../../shared/connection-ticket';
import type { SignalingPeer } from '../../../shared/signaling-protocol';

/**
 * 校验对端的连接票据。
 *
 * @param expected - 信令服务为这条连接宣布的对端
 * @param now - 当前时刻（epoch 毫秒）
 * @returns 对端主体；任何一项不成立都返回 null
 */
export const authenticatePeerTicket = async (
  credential: string,
  context: { readonly connectionId: string },
  expected: SignalingPeer,
  key: CryptoKey,
  now: number
): Promise<P2PPrincipal | null> => {
  const claims = await verifyConnectionTicket(credential, key, { connectionId: context.connectionId, now });
  if (!claims) return null;
  const isExpected = claims.sub === expected.principal && claims.dev === expected.deviceId && claims.ins === expected.key;
  return isExpected ? ticketPrincipal(claims) : null;
};
