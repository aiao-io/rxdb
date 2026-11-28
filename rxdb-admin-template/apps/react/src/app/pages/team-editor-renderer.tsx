import { I18nProvider } from '@aiao/rxdb-i18n-react';
import { RxDBProvider } from '@aiao/rxdb-react';
import type { RenderTeamEditor } from '@rxdb-admin-template/collaboration';
import { createRoot } from 'react-dom/client';
import { workbenchShell } from '../shell/workbench-shell';
import TeamEditor from './team-editor';

/**
 * 团队任务的编辑界面渲染回调（ADMIN-US-221 AC#4）：把 {@link TeamEditor} 渲染进协作包给出的容器。
 *
 * @remarks
 * 编辑界面是独立的 React 根，继承不到主应用的 Provider，所以这里显式提供任务所在的团队库与工作台的国际化运行时：
 * 列表读写的是团队库，而不是匿名工作台的库。数据库实例归协作包所有，Provider 不会销毁它。
 * 实体列表的未保存状态经上下文里的 `reportDirty` 交回协作包。
 * 返回的卸载函数卸载整棵组件树，容器随之清空；协作包在切分支或关库之前调用它。
 */
export const renderTeamEditor: RenderTeamEditor = (container, context) => {
  const root = createRoot(container);
  root.render(
    <RxDBProvider db={context.database}>
      <I18nProvider value={workbenchShell.i18n}>
        <TeamEditor reportDirty={context.reportDirty} />
      </I18nProvider>
    </RxDBProvider>
  );
  return () => root.unmount();
};
