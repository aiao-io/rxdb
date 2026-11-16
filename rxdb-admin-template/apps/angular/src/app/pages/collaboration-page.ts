import { useRxDB } from '@aiao/rxdb-angular';
import { afterNextRender, Component, DestroyRef, ElementRef, inject, viewChild } from '@angular/core';
import { mountCollaboration, readAnonymousAssets } from '@rxdb-admin-template/collaboration';
import { ENTITIES } from '../entities/asset-entities';
import { workbenchShell } from '../shell/workbench-shell';
@Component({ selector: 'app-collaboration-page', template: '<div #host></div>', host: { style: 'display: contents' } })
export default class CollaborationPage {
  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private readonly database = useRxDB();
  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const dispose = mountCollaboration(this.host().nativeElement, {
        translate: (key, values) => workbenchShell.i18n.t(key, values),
        subscribeLanguage: listener => {
          const sub = workbenchShell.i18n.changes$.subscribe(listener);
          return () => sub.unsubscribe();
        },
        importAnonymous: () => readAnonymousAssets(this.database, ENTITIES)
      });
      destroy.onDestroy(dispose);
    });
  }
}
