export class RxDBPluginSync {
  name = 'sync';
  readonly inject = ["plugin:history"] as const;
}
export const rxDBPluginSync = () => new RxDBPluginSync();
