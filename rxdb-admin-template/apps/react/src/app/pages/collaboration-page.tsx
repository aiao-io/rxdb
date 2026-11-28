import { mountCollaboration, readAnonymousRecords } from '@rxdb-admin-template/collaboration';
import { authSession } from '@rxdb-admin-template/collaboration/auth';
import { useEffect, useRef } from 'react';
import { ENTITIES } from '../entities/asset-entities';
import { collaborationLabels } from '../entities/collaboration-labels';
import setupRxdb from '../rxdb/setup_rxdb';
import { createTeamDatabase } from '../rxdb/team-database';
import { loginUrl } from '../shell/auth-gate';
import { workbenchShell } from '../shell/workbench-shell';
import { renderTeamEditor } from './team-editor-renderer';
export default function CollaborationPage() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    return mountCollaboration(host.current, {
      session: authSession(),
      signIn: () => workbenchShell.navigate(loginUrl('/collaboration')),
      translate: (key, values) => workbenchShell.i18n.t(key, values),
      subscribeLanguage: listener => {
        const sub = workbenchShell.i18n.changes$.subscribe(listener);
        return () => sub.unsubscribe();
      },
      importAnonymous: schema => readAnonymousRecords(setupRxdb(), ENTITIES, schema),
      labels: collaborationLabels,
      createTeamDatabase,
      renderEditor: renderTeamEditor
    });
  }, []);
  return <div ref={host} />;
}
