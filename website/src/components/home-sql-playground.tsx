import { CodeEditor } from '@aiao/code-editor-react';
import { WaSqliteClient } from '@aiao/rxdb-adapter-wa-sqlite';
import { Button } from '@site/src/components/button';
import { Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const DEMO_SQL = `CREATE TABLE IF NOT EXISTS t(x PRIMARY KEY, y);
INSERT OR REPLACE INTO t VALUES ('good', 'bad'), ('hot', 'cold');
SELECT * FROM t;`;

type SqliteResultSet = {
  columns: string[];
  rows: unknown[][];
};

type SqliteResult = {
  elapsed: number;
  results: SqliteResultSet[];
  rowsAffected: number;
  sql: string;
};

type SqliteClientLike = {
  disconnect: () => Promise<void>;
  execute: (sql: string) => Promise<SqliteResult>;
  version: () => Promise<string>;
};

type PlaygroundStatus = 'booting' | 'failed' | 'ready' | 'running';

function useDocusaurusColorMode(): 'light' | 'dark' {
  const [colorMode, setColorMode] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const syncColorMode = () => {
      setColorMode(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    };

    syncColorMode();

    const observer = new MutationObserver(syncColorMode);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => observer.disconnect();
  }, []);

  return colorMode;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function formatCell(value: unknown): string {
  if (value === null) {
    return 'NULL';
  }

  if (value === undefined) {
    return 'undefined';
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (ArrayBuffer.isView(value)) {
    return `BLOB(${value.byteLength})`;
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[object]';
    }
  }

  return String(value);
}

export function HomeSqlPlayground() {
  const colorMode = useDocusaurusColorMode();
  const mountedRef = useRef(false);
  const clientRef = useRef<SqliteClientLike | null>(null);
  const runningRef = useRef(false);
  const [sql, setSql] = useState(DEMO_SQL);
  const [status, setStatus] = useState<PlaygroundStatus>('booting');
  const [result, setResult] = useState<SqliteResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [version, setVersion] = useState('--');

  useEffect(() => {
    mountedRef.current = true;

    async function init() {
      try {
        const client = new WaSqliteClient();
        await client.init('website-home-sql-playground', {
          async: true,
          vfs: 'IDBBatchAtomicVFS',
          wasmPath: '/demo/angular/wa-sqlite/wa-sqlite-async.wasm'
        });

        if (!mountedRef.current) {
          await client.disconnect();
          return;
        }

        clientRef.current = client;

        const sqliteVersion = await client.version();

        if (!mountedRef.current) {
          await client.disconnect();
          return;
        }

        setVersion(sqliteVersion);
        setStatus('ready');
      } catch (error) {
        if (!mountedRef.current) {
          return;
        }

        setErrorMessage(formatError(error));
        setStatus('failed');
      }
    }

    void init();

    return () => {
      mountedRef.current = false;
      const client = clientRef.current;
      clientRef.current = null;

      if (client) {
        void client.disconnect().catch(() => undefined);
      }
    };
  }, []);

  async function runSql(nextSql: string) {
    const client = clientRef.current;
    if (!client || runningRef.current) {
      return;
    }

    runningRef.current = true;
    setStatus('running');
    setErrorMessage(null);

    try {
      const nextResult = await client.execute(nextSql);

      if (!mountedRef.current) {
        return;
      }

      setResult(nextResult);
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      setErrorMessage(formatError(error));
    } finally {
      runningRef.current = false;

      if (mountedRef.current) {
        setStatus('ready');
      }
    }
  }

  return (
    <div className='space-y-3'>
      <div className='text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 leading-5'>
        <div className='text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1'>
          <span className='text-foreground font-semibold'>Browser SQL</span>
          <span className='text-xs'>SQLite {version}</span>
        </div>
        <div className='ml-auto flex cursor-pointer flex-wrap items-center gap-1.5'>
          <Button
            type='button'
            size='sm'
            className='bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary h-8 cursor-pointer appearance-none rounded-md border border-transparent px-3 shadow-none transition-colors active:scale-100 active:shadow-none'
            onClick={() => void runSql(sql)}
            disabled={status === 'booting' || status === 'failed'}
            aria-busy={status === 'running'}
          >
            <Play className='size-3.5 fill-current' />
            执行 SQL
          </Button>
        </div>
      </div>

      <div className='border-border/60 bg-background/80 overflow-hidden rounded-xl border'>
        <div className='h-28'>
          <CodeEditor value={sql} onChange={setSql} language='sql' lineWrapping setup='minimal' theme={colorMode} />
        </div>
      </div>

      <div className='border-border/60 bg-muted/20 overflow-hidden rounded-xl border' aria-live='polite'>
        <div className='border-border/60 flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2'>
          <div className='text-xs font-semibold'>执行结果</div>
          {result ?
            <div className='text-muted-foreground text-xs'>
              {result.rowsAffected} rows affected · {result.elapsed.toFixed(1)} ms
            </div>
          : null}
        </div>

        <div className='max-h-[160px] overflow-auto px-3 py-3'>
          {status === 'booting' ?
            <div className='text-muted-foreground text-sm'>正在启动浏览器内 SQLite…</div>
          : null}

          {errorMessage ?
            <div className='rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>
              {errorMessage}
            </div>
          : null}

          {!errorMessage && result && result.results.length === 0 ?
            <div className='text-muted-foreground text-sm'>语句执行成功，未返回结果集。</div>
          : null}

          {!errorMessage && result && result.results.length > 0 ?
            <div className='space-y-3'>
              {result.results.map((resultSet, index) => (
                <div key={`${index}-${resultSet.columns.join('-')}`} className='space-y-1.5'>
                  <div className='text-muted-foreground text-[11px] uppercase'>Result {index + 1}</div>
                  <div className='border-border/60 overflow-x-auto rounded-md border'>
                    <table className='w-full min-w-max border-collapse text-left text-sm'>
                      <thead className='bg-muted/45'>
                        <tr>
                          {resultSet.columns.map(column => (
                            <th key={column} className='border-border/40 border-b px-2.5 py-1.5 font-medium'>
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {resultSet.rows.map((row, rowIndex) => (
                          <tr key={`${rowIndex}-${index}`} className='border-border/30 border-b last:border-b-0'>
                            {row.map((cell, columnIndex) => (
                              <td key={`${rowIndex}-${columnIndex}`} className='px-2.5 py-1.5 font-mono text-xs'>
                                {formatCell(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          : null}

          {!errorMessage && !result && status === 'ready' ?
            <div className='text-muted-foreground text-sm'>输入 SQL 语句，然后点击执行。</div>
          : null}
        </div>
      </div>
    </div>
  );
}

export default HomeSqlPlayground;
