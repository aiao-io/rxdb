import { mountCollaboration, readAnonymousRecords } from '@rxdb-admin-template/collaboration';
import { useEffect, useRef } from 'react';
import { ENTITIES } from '../entities/asset-entities';
import { collaborationLabels } from '../entities/collaboration-labels';
import setupRxdb from '../rxdb/setup_rxdb';
import { workbenchShell } from '../shell/workbench-shell';
export default function CollaborationPage() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    return mountCollaboration(host.current, {
      translate: (key, values) => workbenchShell.i18n.t(key, values),
      subscribeLanguage: listener => {
        const sub = workbenchShell.i18n.changes$.subscribe(listener);
        return () => sub.unsubscribe();
      },
      importAnonymous: schema => readAnonymousRecords(setupRxdb(), ENTITIES, schema),
      labels: collaborationLabels
    });
  }, []);
  return <div ref={host} />;
}
