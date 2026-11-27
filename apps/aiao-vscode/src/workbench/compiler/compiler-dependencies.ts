import type { CompileProjectInput, ProjectTemplate } from './compiler-types.js';

const versions: Record<ProjectTemplate, Readonly<Record<string, string>>> = {
  vanilla: {},
  react: { react: '19.3.1', 'react-dom': '19.3.1' },
  vue: { vue: '3.5.44' },
  angular: {
    '@angular/common': '22.2.3',
    '@angular/compiler': '22.2.3',
    '@angular/core': '22.2.3',
    '@angular/platform-browser': '22.2.3',
    rxjs: '7.8.2',
    tslib: '2.8.1'
  }
};

/** 浏览器只运行模板锁定的依赖，编辑清单不会触发安装或版本替换。 */
export function declaredDependencies(input: CompileProjectInput): ReadonlySet<string> | undefined {
  const source = input.files['package.json'];
  if (source === undefined) return undefined;
  const content = typeof source === 'string' ? source : new TextDecoder('utf-8', { fatal: true }).decode(source);
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('package.json 不是有效的 JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('package.json 必须是对象');
  const dependencies: unknown = (parsed as Record<string, unknown>)['dependencies'];
  if (dependencies === undefined) return new Set();
  if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies))
    throw new Error('package.json dependencies 必须是对象');
  const allowed = versions[input.template];
  for (const [name, version] of Object.entries(dependencies)) {
    if (!Object.hasOwn(allowed, name)) throw new Error(`package.json 不支持运行依赖 ${name}`);
    if (version !== allowed[name])
      throw new Error(`package.json ${name} 必须使用固定版本 ${allowed[name]}，当前声明 ${String(version)}`);
  }
  return new Set(Object.keys(dependencies));
}
