import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const template = readFileSync(resolve(import.meta.dirname, 'home.page.html'), 'utf8');
const rustCommands = readFileSync(resolve(import.meta.dirname, '../../../../src-tauri/src/lib.rs'), 'utf8');

describe('desktop status panel', () => {
  it.each(['桌面状态', '运行环境', '数据库状态', 'IPC 状态', '存储后端'])('shows the %s section', label => {
    expect(template).toContain(label);
  });

  it('uses Lucide icons instead of emoji and handwritten SVG paths', () => {
    for (const emoji of ['🖥', '✅', '⚠', '📦', '🔌', '🚀']) expect(template).not.toContain(emoji);
    expect(template).not.toContain('<path');
    expect(template).toContain('[lucideIcon]');
  });

  it('uses a runtime health command instead of a demo command', () => {
    expect(rustCommands).toContain('fn check_runtime');
    expect(rustCommands).not.toContain('demo_command');
  });
});
