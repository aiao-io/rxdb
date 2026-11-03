/** 会话两端的身份。 */

/** 认证宿主验证过的用户与设备。 */
export interface P2PPrincipal {
  /** 认证主体（用户）标识。 */
  readonly principal: string;
  /** 认证宿主为该用户登记的设备标识；同一用户的不同设备各自持有、各自撤回。 */
  readonly deviceId: string;
}

/** 会话一端的身份：认证主体加运行实例。 */
export interface P2PPeerIdentity {
  /** 认证宿主验证过的用户与设备。 */
  readonly principal: P2PPrincipal;
  /** 运行实例标识：同一设备上的多个实例（标签页、应用进程）各不相同。 */
  readonly instanceId: string;
}

/** 身份的稳定键，用于按对端登记与去重；用户、设备或实例任一不同，键就不同。 */
export const peerIdentityKey = (identity: P2PPeerIdentity): string =>
  JSON.stringify([identity.principal.principal, identity.principal.deviceId, identity.instanceId]);
