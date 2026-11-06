import type { CompileProjectInput, ProjectTemplate } from './compiler/compiler-types.js';
import { templateLocks } from './template-locks.js';

export interface WorkbenchTemplate extends CompileProjectInput {
  title: string;
  files: Record<string, string>;
}

const icon =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="#3178c6"/><path d="m13 24 8 8 15-17" fill="none" stroke="white" stroke-width="5"/></svg>';
const stylesheet =
  'body { margin: 0; padding: 32px; font: 16px system-ui; color: #172136; background: #f6f8fc; } button { cursor: pointer; padding: 10px 16px; border-radius: 8px; border: 1px solid #cad2e0; background: white; font: inherit; } .logo { width: 48px; height: 48px; }';

function manifest(template: ProjectTemplate): string {
  const dependencies =
    template === 'react' ? { react: '19.3.1', 'react-dom': '19.3.1' }
    : template === 'vue' ? { vue: '3.5.44' }
    : {};
  const devDependencies =
    template === 'vue' ?
      { vite: '8.3.5', '@vitejs/plugin-vue': '6.0.10', typescript: '6.0.3' }
    : { vite: '8.3.5', typescript: '6.0.3' };
  return JSON.stringify(
    {
      name: `workbench-${template}`,
      private: true,
      version: '1.0.0',
      type: 'module',
      scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
      dependencies,
      devDependencies
    },
    null,
    2
  );
}

function index(entry: string): string {
  return `<!doctype html>\n<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>浏览器工作台</title></head><body><div id="app"></div><script type="module" src="/${entry}"></script></body></html>`;
}

const commonFiles = {
  'src/style.css': stylesheet,
  'src/icon.svg': icon,
  'tsconfig.json': JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        jsx: 'react-jsx',
        skipLibCheck: true,
        noEmit: true
      },
      include: ['src']
    },
    null,
    2
  ),
  '.gitignore': 'node_modules/\ndist/\n',
  'README.md':
    '# 浏览器工作台项目\n\n使用 Node.js 26 与 pnpm 10：\n\n```sh\npnpm install\npnpm build\npnpm dev\n```\n\n点击工作台顶部「运行」会保存全部文件，自动展开底部项目终端，安装依赖并启动项目。包管理器优先读取 package.json 的 packageManager（npm@版本或 pnpm@版本）；未声明时优先使用 pnpm-lock.yaml，否则使用 npm。启动脚本优先使用 scripts.dev，其次使用 scripts.start。安装进度、编译与运行信息实时显示，Ctrl+C 停止安装或服务；重复点击「运行」会聚焦现有进程。\n\n独立 Shell 会话支持手动输入命令，与项目运行共用源码。预览栏刷新按钮保留独立的受控编译预览；浏览器预览与导出构建共用这些源码。\n'
};

export const vanillaTemplate: WorkbenchTemplate = {
  template: 'vanilla',
  title: 'JavaScript / TypeScript',
  entry: 'src/main.ts',
  files: {
    ...commonFiles,
    'pnpm-lock.yaml': templateLocks.vanilla,
    'package.json': manifest('vanilla'),
    'index.html': index('src/main.ts'),
    'src/label.ts': 'export const label: string = "本地 TypeScript 模板";\n',
    'src/main.ts':
      'import { label } from "./label";\nimport "./style.css";\nimport icon from "./icon.svg";\n\nconst app = document.getElementById("app")!;\napp.innerHTML = `<h1>${label}</h1><button>次数 0</button>`;\nconst logo = document.createElement("img");\nlogo.className = "logo";\nlogo.src = icon;\napp.prepend(logo);\nlet count = 0;\napp.querySelector("button")!.addEventListener("click", event => {\n  (event.currentTarget as HTMLButtonElement).textContent = `次数 ${++count}`;\n  console.log("当前次数", count);\n});\n'
  }
};

export const reactTemplate: WorkbenchTemplate = {
  template: 'react',
  title: 'React TSX',
  entry: 'src/main.tsx',
  files: {
    ...commonFiles,
    'pnpm-lock.yaml': templateLocks.react,
    'package.json': manifest('react'),
    'index.html': index('src/main.tsx'),
    'src/Counter.tsx':
      'import { useState } from "react";\n\nexport function Counter() {\n  const [count, setCount] = useState(0);\n  return <button onClick={() => { setCount(count + 1); console.log("当前次数", count + 1); }}>次数 {count}</button>;\n}\n',
    'src/main.tsx':
      'import { createRoot } from "react-dom/client";\nimport { Counter } from "./Counter";\nimport "./style.css";\nimport icon from "./icon.svg";\n\ncreateRoot(document.getElementById("app")!).render(<main><img className="logo" src={icon}/><h1>本地 React 模板</h1><Counter/></main>);\n'
  }
};

export const vueTemplate: WorkbenchTemplate = {
  template: 'vue',
  title: 'Vue SFC',
  entry: 'src/main.ts',
  files: {
    ...commonFiles,
    'pnpm-lock.yaml': templateLocks.vue,
    'package.json': manifest('vue'),
    'index.html': index('src/main.ts'),
    'vite.config.ts':
      'import { defineConfig } from "vite";\nimport vue from "@vitejs/plugin-vue";\nexport default defineConfig({ plugins: [vue()] });\n',
    'src/main.ts':
      'import { createApp } from "vue";\nimport App from "./App.vue";\nimport "./style.css";\ncreateApp(App).mount("#app");\n',
    'src/App.vue':
      '<script setup lang="ts">\nimport Counter from "./Counter.vue";\nimport icon from "./icon.svg";\nconst title: string = "本地 Vue 模板";\n</script>\n\n<template><main><img class="logo" :src="icon"><h1>{{ title }}</h1><Counter/></main></template>\n\n<style scoped>h1 { color: #15815a; }</style>\n',
    'src/Counter.vue':
      '<script setup lang="ts">\nimport { ref } from "vue";\nconst count = ref(0);\nfunction increment() { count.value++; console.log("当前次数", count.value); }\n</script>\n\n<template><button @click="increment">次数 {{ count }}</button></template>\n\n<style scoped>button { border-color: #42b883; }</style>\n'
  }
};

export const frontendTemplates = { vanilla: vanillaTemplate, react: reactTemplate, vue: vueTemplate };

/** 欢迎视图「初始化 Demo 项目」提供的最小 React / Vue 示例。 */
export const defaultFrontendDemos = {
  react: {
    ...reactTemplate,
    title: 'React 最小 Demo',
    files: {
      'package.json': reactTemplate.files['package.json'],
      'pnpm-lock.yaml': reactTemplate.files['pnpm-lock.yaml'],
      'index.html': reactTemplate.files['index.html'],
      'src/main.tsx': `import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('app')!).render(<h1>Hello React</h1>);
`
    }
  },
  vue: {
    ...vueTemplate,
    title: 'Vue 最小 Demo',
    files: {
      'package.json': vueTemplate.files['package.json'],
      'pnpm-lock.yaml': vueTemplate.files['pnpm-lock.yaml'],
      'index.html': vueTemplate.files['index.html'],
      'vite.config.ts': vueTemplate.files['vite.config.ts'],
      'src/main.ts': `import { createApp } from 'vue';
import App from './App.vue';

createApp(App).mount('#app');
`,
      'src/App.vue': `<template><h1>Hello Vue</h1></template>
`
    }
  }
} as const;
