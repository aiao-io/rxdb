export class RxDBPluginHistory {
  name = 'history';
  readonly inject = [] as const;
}
export const rxDBPluginHistory = () => new RxDBPluginHistory();
