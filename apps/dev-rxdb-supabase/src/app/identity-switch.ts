/** 切换身份要用到的几步，抽成参数便于脱离浏览器测试。 */
export interface IdentitySwitchSteps {
  /** 远端适配器此刻是否连着 */
  remoteConnected(): Promise<boolean>;
  disconnectRemote(): Promise<void>;
  connectRemote(): Promise<unknown>;
  /** 登录或退出 */
  signIn(): Promise<void>;
  /** 重新加载页面，按新会话打开那个身份自己的库 */
  reload(): void;
}

/**
 * 切换身份：先断开远端，再登录或退出，成功后重新加载。
 *
 * @param steps - 各步的实现
 * @throws 透传登录或退出的错误；此前连着的远端会先连回去，页面照常可用
 *
 * @remarks
 * 切换身份以重新加载收尾，本页的远端连接反正要换掉。不先断开的话，登录事件会让适配器按新身份重建实时订阅，
 * 重建发出的请求随即被重新加载打断，控制台留一条「Failed to resolve caller buckets … Failed to fetch」告警。
 */
export async function switchIdentity(steps: IdentitySwitchSteps): Promise<void> {
  const wasConnected = await steps.remoteConnected();
  await steps.disconnectRemote();
  try {
    await steps.signIn();
  } catch (error) {
    if (wasConnected) await steps.connectRemote();
    throw error;
  }
  steps.reload();
}
