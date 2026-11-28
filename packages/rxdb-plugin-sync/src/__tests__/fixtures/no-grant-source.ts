/**
 * 没有远端授权来源的 `RxDB`：同步入口进门时的授权快照刷新什么都不做（US-029）。
 *
 * @remarks
 * 同步插件的公开入口现在都会调 `rxdb.grants.refresh()`。手搭的 `rxdb` 替身补上它，行为就与没有这个功能时一致；
 * 要测刷新本身，见 `SyncManager.orchestration.spec.ts` 与核心的 `grant-remote-source.spec.ts`。
 */
export const noGrantSource = {
  grants: { refresh: async (): Promise<void> => undefined }
};
