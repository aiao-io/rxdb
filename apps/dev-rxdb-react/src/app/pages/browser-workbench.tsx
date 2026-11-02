import { BrowserWorkbench } from '@aiao/browser-workbench-react';
import { createRxDBWorkbenchCatalog } from '@aiao/browser-workbench/rxdb-catalog';
import { useRxDB } from '@aiao/rxdb-react';
import { useMemo } from 'react';

export default function BrowserWorkbenchPage() {
  const db = useRxDB();
  const options = useMemo(() => ({ catalog: createRxDBWorkbenchCatalog(db) }), [db]);
  return (
    <div className='fixed inset-0 z-50' data-testid='browser-workbench'>
      <BrowserWorkbench options={options} />
    </div>
  );
}
