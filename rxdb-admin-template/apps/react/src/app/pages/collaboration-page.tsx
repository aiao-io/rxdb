import { workbenchShell } from '../shell/workbench-shell';
import { mountCollaboration, readAnonymousAssets } from '@rxdb-admin-template/collaboration';
import { useEffect, useRef } from 'react';
import { ENTITIES } from '../entities/asset-entities';
import setupRxdb from '../rxdb/setup_rxdb';
export default function CollaborationPage() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    return mountCollaboration(host.current, { translate: (key, values) => workbenchShell.i18n.t(key, values),
      subscribeLanguage: listener => { const sub = workbenchShell.i18n.changes$.subscribe(listener); return () => sub.unsubscribe(); },
      importAnonymous: () => readAnonymousAssets(setupRxdb(), ENTITIES) });
  }, []);
  return <div ref={host} />;
}
