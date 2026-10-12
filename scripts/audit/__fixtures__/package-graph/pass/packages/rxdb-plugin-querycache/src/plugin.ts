export class RxDBPluginQueryCache {
  name = 'queryCache';
  readonly inject = [] as const;
}
export const rxDBPluginQueryCache = () => new RxDBPluginQueryCache();
