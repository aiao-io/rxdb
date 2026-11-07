/** Worker 侧的连接票据签发。私钥来自 secret `TICKET_PRIVATE_JWK`（Ed25519 JWK，含 `d`）。 */
import {
  importTicketSigningKey,
  publicTicketKeyOf,
  signConnectionTicket,
  type ConnectionTicketClaims
} from '../shared/connection-ticket';
import type { SignalingPeer } from '../shared/signaling-protocol';

/** 票据有效期：只用于会话 hello，建连通常在几秒内完成。 */
export const TICKET_TTL_SECONDS = 300;

/** 票据签发器。 */
export interface TicketIssuer {
  /** 验票公钥。 */
  readonly publicKey: JsonWebKey;
  /** 为一条连接的发起方与响应方各签一张票。 */
  issue(connectionId: string, initiator: SignalingPeer, responder: SignalingPeer): Promise<readonly [string, string]>;
}

const parsePrivateJwk = (text: string): JsonWebKey => {
  const jwk = (text ? JSON.parse(text) : null) as JsonWebKey | null;
  if (jwk?.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.d || !jwk.x) {
    throw new Error('TICKET_PRIVATE_JWK must be an Ed25519 private JWK');
  }
  return jwk;
};

/**
 * 创建签发器。
 *
 * @param privateJwkText - secret `TICKET_PRIVATE_JWK` 的内容
 * @param clock - 当前时刻（epoch 毫秒）
 * @throws Error 私钥缺失或不是 Ed25519 私钥
 */
export const createTicketIssuer = async (privateJwkText: string, clock: () => number): Promise<TicketIssuer> => {
  const jwk = parsePrivateJwk(privateJwkText);
  const key = await importTicketSigningKey(jwk);
  const sign = (connectionId: string, peer: SignalingPeer): Promise<string> => {
    const claims: ConnectionTicketClaims = {
      v: 1,
      cid: connectionId,
      sub: peer.principal,
      dev: peer.deviceId,
      ins: peer.key,
      exp: Math.floor(clock() / 1000) + TICKET_TTL_SECONDS
    };
    return signConnectionTicket(claims, key);
  };
  return {
    publicKey: publicTicketKeyOf(jwk),
    issue: async (connectionId, initiator, responder) =>
      Promise.all([sign(connectionId, initiator), sign(connectionId, responder)])
  };
};
