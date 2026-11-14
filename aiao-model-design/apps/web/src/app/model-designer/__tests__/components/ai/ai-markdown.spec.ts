import { describe, expect, it } from 'vitest';
import { renderAiMarkdown } from '../../../components/ai/ai-markdown';

describe('renderAiMarkdown', () => {
  it('renders headings, lists, emphasis, links and inline code', () => {
    const html = renderAiMarkdown('# 模型\n\n- **User** has `id`\n- [查看文档](https://example.com)');

    expect(html).toContain('<h3>模型</h3>');
    expect(html).toContain('<strong>User</strong>');
    expect(html).toContain('<code>id</code>');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('<li>');
  });

  it('escapes raw html before rendering markdown', () => {
    const html = renderAiMarkdown('<script>alert(1)</script> **safe**');

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('<strong>safe</strong>');
  });

  it('renders fenced code blocks as preformatted content', () => {
    const html = renderAiMarkdown('```sql\nselect * from users;\n```');

    expect(html).toContain('<pre><code>select * from users;</code></pre>');
  });
});
