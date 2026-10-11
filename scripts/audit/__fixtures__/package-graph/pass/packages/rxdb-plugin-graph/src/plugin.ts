export class RxDBPluginGraph {
  name = 'graph';
  readonly inject = [] as const;
}
export const rxDBPluginGraph = () => new RxDBPluginGraph();
