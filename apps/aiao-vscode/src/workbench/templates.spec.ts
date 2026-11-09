import { describe, expect, it } from 'vitest';
import { frontendTemplates } from './templates.js';
import { projectRunPlan } from './terminal/project-command.js';

describe('前端模板', () => {
  it('运行使用的 vite 启动脚本关闭清屏，项目终端保留安装过程', () => {
    for (const template of Object.values(frontendTemplates)) {
      const { script } = projectRunPlan(template.files);
      const manifest = JSON.parse(template.files['package.json'] ?? '') as { scripts: Record<string, string> };
      expect(manifest.scripts[script], template.title).toBe('vite --clearScreen false');
    }
  });
});
