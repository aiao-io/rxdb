/** 验收夹具两端共用的身份、凭据与确定性文件内容；不依赖 Node 或浏览器 API。 */
import type { P2PPeerIdentity, P2PPrincipal } from '@aiao/rxdb-plugin-p2p';

/** 夹具里两端约定的连接标识；凭据绑定到它。 */
export const CONNECTION_ID = 'acceptance-connection';

/** 两台「设备」的身份。 */
export const PEERS = {
  alice: { principal: { principal: 'alice', deviceId: 'laptop' }, instanceId: 'alice-laptop-1' },
  bob: { principal: { principal: 'bob', deviceId: 'desktop' }, instanceId: 'bob-desktop-1' }
} as const satisfies Record<string, P2PPeerIdentity>;

/** 夹具里的设备名。 */
export type PeerName = keyof typeof PEERS;

/** 夹具认证宿主签发的凭据：绑定连接与身份，重放到别的连接即失效。 */
export const credentialFor = (identity: P2PPeerIdentity, connectionId: string): string =>
  ['token', connectionId, identity.principal.principal, identity.principal.deviceId].join(':');

/** 与 {@link credentialFor} 配套的校验：连接不对、格式不对都拒绝。 */
export const verifyCredential = (
  credential: string,
  context: { readonly connectionId: string }
): P2PPrincipal | null => {
  const [scheme, connectionId, principal, deviceId] = credential.split(':');
  if (scheme !== 'token' || connectionId !== context.connectionId || !principal || !deviceId) return null;
  return { principal, deviceId };
};

/** 一个待生成的文件：内容由种子确定，两端各自生成也逐字节相同。 */
export interface FileSpec {
  readonly seed: number;
  readonly size: number;
  readonly chunkSize: number;
}

/** 按种子生成确定性的文件内容。 */
export const patterned = (size: number, seed: number): Uint8Array => {
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) bytes[index] = (index * 31 + seed * 17) % 251;
  return bytes;
};
