import { BrowserWorkbench } from '@aiao/browser-workbench-react';
import { createRxDBWorkbenchCatalog } from '@aiao/browser-workbench/rxdb-catalog';
import { useRxDB } from '@aiao/rxdb-react';
import { useMemo } from 'react';

export default function BrowserWorkbenchPage() {
  const db = useRxDB();
  const options = useMemo(() => ({ catalog: createRxDBWorkbenchCatalog(db) }), [db]);
  return (
    <div className='h-full min-h-0 w-full' data-testid='browser-workbench'>
      <BrowserWorkbench options={options} />
    </div>
  );
}
