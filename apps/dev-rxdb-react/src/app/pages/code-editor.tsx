import { CodeEditor } from '@aiao/code-editor-react';
import { useState } from 'react';
import { useTheme } from '../hooks/useTheme';

const DEFAULT_SQL = `CREATE TABLE IF NOT EXISTS user(
    id INTEGER PRIMARY KEY   AUTOINCREMENT,
    name           TEXT      NOT NULL
);

INSERT INTO user (name) VALUES ('Paul');
INSERT INTO user (name) VALUES ('Jimmy');

select * from user;`;

export function CodeEditorPage() {
  const { currentThemeLightDark } = useTheme();
  const [code, setCode] = useState(DEFAULT_SQL);

  return (
    <div className='h-full w-full' data-testid='code-editor'>
      <CodeEditor theme={currentThemeLightDark} value={code} onChange={setCode} />
    </div>
  );
}

export default CodeEditorPage;
