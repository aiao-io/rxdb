import type { RenderTeamEditor } from '@rxdb-admin-template/collaboration';
import { createApp } from 'vue';
import TeamEditor from './team-editor.vue';

/**
 * 团队任务的编辑界面渲染回调（ADMIN-US-221 AC#4）：把 {@link TeamEditor} 渲染进协作包给出的容器。
 *
 * @remarks
 * 编辑界面是独立的 Vue 应用，继承不到主应用的 provide：任务所在的团队库作为根组件的 prop 交给它，由它提供给后代，
 * 列表读写的是团队库，而不是匿名工作台的库。数据库实例归协作包所有，这里不会销毁它。
 * 实体列表的未保存状态经上下文里的 `reportDirty` 交回协作包，同样作为根组件的 prop 交给它。
 * 返回的卸载函数卸载整个应用，容器随之清空；协作包在切分支或关库之前调用它。
 */
export const renderTeamEditor: RenderTeamEditor = (container, context) => {
  const app = createApp(TeamEditor, { database: context.database, reportDirty: context.reportDirty });
  app.mount(container);
  return () => app.unmount();
};
