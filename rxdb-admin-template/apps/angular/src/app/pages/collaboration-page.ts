import { useRxDB } from '@aiao/rxdb-angular';
import { afterNextRender, Component, DestroyRef, ElementRef, inject, viewChild } from '@angular/core';
import { mountCollaboration, readAnonymousRecords } from '@rxdb-admin-template/collaboration';
import { authSession } from '@rxdb-admin-template/collaboration/auth';
import { ENTITIES } from '../entities/asset-entities';
import { collaborationLabels } from '../entities/collaboration-labels';
import { createTeamDatabase } from '../rxdb/team-database';
import { loginUrl } from '../shell/auth-gate';
import { workbenchShell } from '../shell/workbench-shell';
import { useRenderTeamEditor } from './team-editor-renderer';
@Component({ selector: 'app-collaboration-page', template: '<div #host></div>', host: { style: 'display: contents' } })
export default class CollaborationPage {
  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private readonly database = useRxDB();
  private readonly renderEditor = useRenderTeamEditor();
  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const dispose = mountCollaboration(this.host().nativeElement, {
        session: authSession(),
        signIn: () => workbenchShell.navigate(loginUrl('/collaboration')),
        translate: (key, values) => workbenchShell.i18n.t(key, values),
        subscribeLanguage: listener => {
          const sub = workbenchShell.i18n.changes$.subscribe(listener);
          return () => sub.unsubscribe();
        },
        importAnonymous: schema => readAnonymousRecords(this.database, ENTITIES, schema),
        labels: collaborationLabels,
        createTeamDatabase,
        renderEditor: this.renderEditor
      });
      destroy.onDestroy(dispose);
    });
  }
}
