import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { compileAngular } from './angular-compiler.js';
import { compileProject } from './compiler-project.js';

describe('受控项目编译', () => {
  it('解析 TypeScript、相对模块、CSS 和本地图片', async () => {
    const result = await compileProject(
      {
        template: 'vanilla',
        entry: 'src/main.ts',
        files: {
          'src/main.ts':
            "import { label } from './label'; import './style.css'; import icon from './icon.svg'; document.body.innerHTML = `<img src=\"${icon}\">${label}`;",
          'src/label.ts': "export const label: string = '本地模块';",
          'src/style.css': "body { color: rgb(1, 2, 3); background-image: url('./icon.svg'); }",
          'src/icon.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>'
        }
      },
      { build }
    );
    expect(result.js).toContain('本地模块');
    expect(result.js).toContain('data:image/svg+xml');
    expect(result.css).toContain('rgb(1, 2, 3)');
    expect(result.css).toContain('data:image/svg+xml');
  });

  it('编译跨文件 TSX，并仅保留受控的 React 外部模块', async () => {
    const result = await compileProject(
      {
        template: 'react',
        entry: 'main.tsx',
        files: {
          'main.tsx':
            "import {createRoot} from 'react-dom/client'; import {Counter} from './Counter'; createRoot(document.getElementById('app')!).render(<Counter/>);",
          'Counter.tsx':
            "import {useState} from 'react'; export function Counter(){ const [count,setCount]=useState(0); return <button onClick={()=>setCount(count+1)}>次数 {count}</button>; }"
        }
      },
      { build }
    );
    expect(result.js).toContain('react-dom/client');
    expect(result.js).toContain('react/jsx-runtime');
    expect(result.js).toContain('useState');
    expect(result.js).not.toContain('from "./Counter"');
  });

  it('编译 Vue script setup、子组件与 scoped CSS', async () => {
    const result = await compileProject(
      {
        template: 'vue',
        entry: 'main.ts',
        files: {
          'main.ts': "import {createApp} from 'vue'; import App from './App.vue'; createApp(App).mount('#app');",
          'App.vue':
            '<script setup lang="ts">import Child from "./Child.vue"; const title: string = "父组件";</script><template><h1>{{title}}</h1><Child/></template><style scoped>h1 { color: red; }</style>',
          'Child.vue':
            '<script setup>import {ref} from "vue"; const count=ref(0);</script><template><button @click="count++">次数 {{count}}</button></template><style scoped>button { color: blue; }</style>'
        }
      },
      { build }
    );
    expect(result.js).toContain('父组件');
    expect(result.js).toContain('__scopeId');
    expect(result.css).toMatch(/h1\[data-v-[a-f0-9]+\]/);
    expect(result.css).toMatch(/button\[data-v-[a-f0-9]+\]/);
  });

  it.each(['missing-package', 'https://cdn.invalid/pkg.js', '/other-project/private.ts', '../private.ts'])(
    '拒绝未声明或越界导入：%s',
    async specifier => {
      await expect(
        compileProject(
          { template: 'vanilla', entry: 'main.ts', files: { 'main.ts': `import '${specifier}';` } },
          { build }
        )
      ).rejects.toThrow();
    }
  );

  it('拒绝同名大小写碰撞与 .git 文件', async () => {
    await expect(
      compileProject({ template: 'vanilla', entry: 'main.ts', files: { 'main.ts': '', 'MAIN.ts': '' } }, { build })
    ).rejects.toThrow('大小写');
    await expect(
      compileProject({ template: 'vanilla', entry: 'main.ts', files: { 'main.ts': '', '.git/config': '' } }, { build })
    ).rejects.toThrow('.git');
  });

  it('诊断保留出错文件与行号', async () => {
    await expect(
      compileProject(
        { template: 'vanilla', entry: 'broken.ts', files: { 'broken.ts': 'const value: = 1;' } },
        { build }
      )
    ).rejects.toThrow('broken.ts:1');
  });

  it('HTML 提取的样式表和内联 CSS 共用同一资源解析器', async () => {
    const result = await compileProject(
      {
        template: 'vanilla',
        entry: 'main.js',
        files: { 'main.js': '', 'styles.css': 'body { color: red; }', 'icon.svg': '<svg/>' },
        styles: ['styles.css'],
        inlineCSS: 'h1 { background: url("./icon.svg"); }'
      },
      { build }
    );
    expect(result.css).toContain('color: red');
    expect(result.css).toContain('data:image/svg+xml');
  });

  it('Vue 普通 script 与纯模板组件均保留 render 和作用域样式', async () => {
    const result = await compileProject(
      {
        template: 'vue',
        entry: 'main.ts',
        files: {
          'main.ts': 'import App from "./App.vue"; import Child from "./Child.vue"; console.log(App, Child);',
          'App.vue':
            '<script>export default { data(){return {title:"normal"}} }</script><template><h1>{{title}}</h1></template>',
          'Child.vue': '<template><button>child</button></template><style scoped>button{color:red}</style>'
        }
      },
      { build }
    );
    expect(result.js).toContain('.render = render');
    expect(result.css).toContain('data-v-');
  });

  it.each([
    '<script setup src="./external.ts"></script><template>app</template>',
    '<template lang="pug">h1 app</template>',
    '<template><div></template>',
    '<template>app</template><docs>custom</docs>'
  ])('Vue 不支持的语义与错误模板给出文件诊断', async source => {
    await expect(
      compileProject({ template: 'vue', entry: 'App.vue', files: { 'App.vue': source } }, { build })
    ).rejects.toThrow('App.vue');
  });

  it('二进制资源保留字节，未知文件类型与越界文件路径明确拒绝', async () => {
    const result = await compileProject(
      {
        template: 'vanilla',
        entry: 'main.ts',
        files: {
          'main.ts': 'import icon from "./icon.png";console.log(icon);',
          'icon.png': new Uint8Array([137, 80, 78, 71])
        }
      },
      { build }
    );
    expect(result.js).toContain('data:image/png;base64,iVBORw==');
    await expect(
      compileProject(
        { template: 'vanilla', entry: 'main.ts', files: { 'main.ts': 'import "./unknown.scss";', 'unknown.scss': '' } },
        { build }
      )
    ).rejects.toThrow('不支持此文件类型');
    await expect(
      compileProject({ template: 'vanilla', entry: 'main.ts', files: { '../main.ts': '' } }, { build })
    ).rejects.toThrow('越界');
  });

  it('Angular 文件交给独立适配器且不接受未知 Angular 包', async () => {
    const result = await compileProject(
      { template: 'angular', entry: 'main.ts', files: { 'main.ts': 'SOURCE' } },
      { build, angularTransform: async source => `console.log(${JSON.stringify(source)});` }
    );
    expect(result.js).toContain('SOURCE');
    await expect(
      compileProject({ template: 'angular', entry: 'main.ts', files: { 'main.ts': '' } }, { build })
    ).rejects.toThrow('Angular');
  });

  it('Angular templateUrl 从项目快照内联，缺失时给出文件诊断', async () => {
    const input = {
      template: 'angular' as const,
      entry: 'src/main.ts',
      files: {
        'src/main.ts': "import './app';",
        'src/app.ts': "@Component({ selector: 'app-root', templateUrl: './app.html' }) export class App {}",
        'src/app.html': '<h1>分离模板</h1>'
      }
    };
    const result = await compileProject(input, { build, angularTransform: compileAngular });
    expect(result.js).toContain('分离模板');
    expect(result.js).not.toContain('templateUrl');
    await expect(
      compileProject(
        {
          ...input,
          files: { ...input.files, 'src/app.ts': "@Component({templateUrl: './missing.html'}) export class App {}" }
        },
        { build, angularTransform: compileAngular }
      )
    ).rejects.toThrow('src/app.ts');
  });

  it('固定 React 运行时与共享 chunk 全部内联，不残留裸模块或 HTTP 导入', async () => {
    const result = await compileProject(
      {
        template: 'react',
        entry: 'main.ts',
        files: { 'main.ts': 'import {useState} from "react";console.log(useState());' }
      },
      {
        build,
        runtimeFiles: {
          'runtime/react.js': 'export {useState} from "./chunk-shared.js";',
          'runtime/chunk-shared.js': 'export function useState(){return "runtime state";}'
        },
        runtimeImports: { react: 'runtime/react.js' }
      }
    );
    expect(result.js).toContain('runtime state');
    expect(result.js).not.toMatch(/(?:from|import)\s*["'](?:react|https?:)/);
    expect(result.js).not.toContain('./chunk-shared.js');
  });

  it('固定 Vue 运行时内联，不能通过 runtime 配置授予未知包', async () => {
    const input = {
      template: 'vue' as const,
      entry: 'main.ts',
      files: { 'main.ts': 'import {ref} from "vue";console.log(ref(1));' }
    };
    const options = {
      build,
      runtimeFiles: { 'runtime/vue.js': 'export function ref(value){return {value};}' },
      runtimeImports: { vue: 'runtime/vue.js', unknown: 'runtime/vue.js' }
    };
    const result = await compileProject(input, options);
    expect(result.js).not.toContain('from "vue"');
    await expect(compileProject({ ...input, files: { 'main.ts': 'import "unknown";' } }, options)).rejects.toThrow(
      '未声明'
    );
  });

  it.each(['../../private.js', 'https://ide.test/private.js'])(
    '拒绝 runtime chunk 越界或网络加载：%s',
    async specifier => {
      await expect(
        compileProject(
          { template: 'react', entry: 'main.ts', files: { 'main.ts': 'import "react";' } },
          {
            build,
            runtimeFiles: { 'runtime/react.js': `import "${specifier}";` },
            runtimeImports: { react: 'runtime/react.js' }
          }
        )
      ).rejects.toThrow();
    }
  );

  it('已启用运行时内联时，缺失资源不能退回 iframe HTTP 加载', async () => {
    await expect(
      compileProject(
        { template: 'react', entry: 'main.ts', files: { 'main.ts': 'import "react";' } },
        { build, runtimeFiles: {}, runtimeImports: {} }
      )
    ).rejects.toThrow('运行时');
  });

  it('用户修改固定依赖版本时给出具体诊断，不继续运行旧版本', async () => {
    await expect(
      compileProject(
        {
          template: 'react',
          entry: 'main.ts',
          files: { 'main.ts': '', 'package.json': JSON.stringify({ dependencies: { react: 'latest' } }) }
        },
        { build }
      )
    ).rejects.toThrow('react 必须使用固定版本 19.3.1');
  });

  it('未知运行依赖与未声明的导入都拒绝，开发依赖和脚本不会被执行', async () => {
    await expect(
      compileProject(
        {
          template: 'vue',
          entry: 'main.ts',
          files: { 'main.ts': '', 'package.json': JSON.stringify({ dependencies: { unknown: '1.0.0' } }) }
        },
        { build }
      )
    ).rejects.toThrow('不支持运行依赖 unknown');
    await expect(
      compileProject(
        { template: 'react', entry: 'main.ts', files: { 'main.ts': 'import "react";', 'package.json': '{}' } },
        { build }
      )
    ).rejects.toThrow('package.json 未声明运行依赖 react');
    await expect(
      compileProject(
        {
          template: 'react',
          entry: 'main.ts',
          files: {
            'main.ts': 'console.log(1);',
            'package.json': JSON.stringify({
              devDependencies: { custom: 'latest' },
              scripts: { postinstall: 'invalid command' }
            })
          }
        },
        { build }
      )
    ).resolves.toMatchObject({ css: '' });
  });
});
