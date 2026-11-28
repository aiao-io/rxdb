/**
 * 没声明 `RxDBOptions.identity` 的 `RxDB`，在与远端交换数据之前的身份核对：什么都不做（US-035）。
 *
 * @remarks
 * 同步插件的远端入口现在都会调 `rxdb.assertCallerIdentity(remote)`。手搭的 `rxdb` 替身补上它，
 * 行为就与没有这个功能时一致；要测身份核对本身，用真实的 `RxDB`（见 `remote-identity.spec.ts`）。
 */
export const noIdentityDeclared = {
  assertCallerIdentity: async (): Promise<void> => undefined
};
