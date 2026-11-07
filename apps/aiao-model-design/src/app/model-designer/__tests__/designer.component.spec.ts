import { describe, expect, it } from 'vitest';
import { executableSqlPreview } from '../designer.component';

describe('designer SQL execution assembly', () => {
  it('snapshots the current SQL preview', () => {
    const files = [
      { path: 'index.js', content: 'export {}' },
      { path: 'blog.diff.sql', content: 'ALTER TABLE users ADD COLUMN name text;' }
    ];

    const snapshot = executableSqlPreview(files);
    files[1] = { path: 'blog.diff.sql', content: 'DROP TABLE users;' };

    expect(snapshot).toBe('ALTER TABLE users ADD COLUMN name text;');
  });

  it('rejects non-SQL and empty SQL previews', () => {
    expect(executableSqlPreview([{ path: 'index.js', content: 'export {}' }])).toBeNull();
    expect(executableSqlPreview([{ path: 'empty.sql', content: '  ' }])).toBeNull();
  });
});
