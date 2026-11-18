import { RxDB } from '@aiao/rxdb';
import { Dialog } from '@angular/cdk/dialog';
import { ApplicationRef, createComponent, createEnvironmentInjector, EnvironmentInjector, inject } from '@angular/core';
import type { RenderTeamEditor } from '@rxdb-admin-template/collaboration';
import TeamEditor from './team-editor';

/**
 * 团队任务的编辑界面渲染回调（ADMIN-US-221 AC#4）：把 {@link TeamEditor} 渲染进协作包给出的容器。必须在注入上下文中调用。
 *
 * @remarks
 * 编辑界面是动态创建的组件，挂在一个子环境注入器上，注入器里：
 * - `RxDB` 换成任务所在的团队库，列表与表单（`useRxDB()` 即 `inject(RxDB)`）读写的是团队库，而不是匿名工作台的库；
 * - 对话框服务 `Dialog` 重新提供一份。列表用它打开记录详情对话框，对话框内容的注入器以服务所在的注入器为父：
 *   不重新提供的话，详情对话框读到的是根注入器里匿名工作台的库，在团队任务里编辑记录就会读写错库。
 *
 * 应用是零 Zone 的：组件的视图要附着到 `ApplicationRef`，才会随 signal 变化（切换页签、切换语言）被检查。
 * 对话框不随创建它的列表销毁，所以卸载时先关掉对话框服务里仍然打开的对话框；随后销毁组件（视图随之脱离应用、
 * 宿主元素移出容器，容器即被清空）并销毁子注入器。协作包在切分支或关库之前调用返回的卸载函数。
 */
export function useRenderTeamEditor(): RenderTeamEditor {
  const parent = inject(EnvironmentInjector);
  const appRef = inject(ApplicationRef);
  return (container, context) => {
    const environmentInjector = createEnvironmentInjector(
      [{ provide: RxDB, useValue: context.database }, Dialog],
      parent
    );
    const hostElement = container.ownerDocument.createElement('div');
    container.append(hostElement);
    const ref = createComponent(TeamEditor, { environmentInjector, hostElement });
    appRef.attachView(ref.hostView);
    return () => {
      environmentInjector.get(Dialog).closeAll();
      ref.destroy();
      environmentInjector.destroy();
    };
  };
}
