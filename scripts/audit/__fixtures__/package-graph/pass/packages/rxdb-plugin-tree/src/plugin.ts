export class RxDBPluginTree {
  name = 'tree';
  readonly inject = [] as const;
}
export const rxDBPluginTree = () => new RxDBPluginTree();
