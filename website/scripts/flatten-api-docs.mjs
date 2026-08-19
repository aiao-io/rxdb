#!/usr/bin/env node
/**
 * 扁平化 API 文档结构
 * 将 docs/api/@aiao/* 移动到 docs/api/*
 * 移除 @aiao 层级以简化导航
 */

import { existsSync } from 'node:fs';
import { readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const apiDir = join(__dirname, '..', 'docs', 'api');
const scopeDir = join(apiDir, '@aiao');

/** 单次扫描解码用的实体表，键与 `/&(?:lt|gt|amp|quot|#39);/g` 一一对应 */
const HTML_ENTITY_DECODE_MAP = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'"
};

const apiPackageDescriptions = {
  rxdb: '核心 Local-first 数据库、实体模型与查询能力',
  'rxdb-adapter-pglite': '浏览器内 PGlite 适配器',
  'rxdb-adapter-wa-sqlite': '浏览器内 SQLite 适配器',
  'rxdb-adapter-supabase': 'Supabase 同步适配器',
  'rxdb-adapter-sqlite': '官方 SQLite WASM 适配器',
  'rxdb-adapter-sqlite-core': 'SQLite 适配器共享内核',
  'rxdb-adapter-sqlite-wasm': 'sqlite-wasm 适配器（支持 FTS5 搜索）',
  'rxdb-adapter-sqliteai': 'sqliteai 运行时适配器',
  'rxdb-adapter-encrypted': '透明加密适配器封装',
  'rxdb-angular': 'Angular 集成层',
  'rxdb-react': 'React 集成层',
  'rxdb-vue': 'Vue 集成层',
  'rxdb-plugin-graph': '图结构实体与查询插件',
  'rxdb-plugin-workspace': '工作区与协作相关插件能力',
  'rxdb-plugin-storage': '存储管理与配额插件',
  'rxdb-plugin-search': '基于 FTS5 的响应式全文检索插件',
  'rxdb-plugin-search-angular': '搜索插件 Angular 集成（injectSearch）',
  'rxdb-plugin-search-react': '搜索插件 React 集成（useSearch）',
  'rxdb-plugin-search-vue': '搜索插件 Vue 集成（useSearch）',
  'code-editor': '框架无关的代码编辑器核心',
  'code-editor-angular': '代码编辑器 Angular 集成',
  'code-editor-react': '代码编辑器 React 集成',
  'code-editor-vue': '代码编辑器 Vue 集成',
  'rxdb-client-generator': '模型驱动客户端代码生成器',
  'rxdb-devtools': '开发者调试工具',
  utils: '浏览器能力检测与通用工具'
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function postProcessRootDocs() {
  const candidates = ['README.md', 'index.md'];

  for (const candidate of candidates) {
    const docPath = join(apiDir, candidate);
    if (!existsSync(docPath)) continue;

    let content = await readFile(docPath, 'utf-8');
    const originalContent = content;

    content = content.replace(/@aiao\//g, '');
    content = content.replace(/^# Aiao API Documentation$/m, '# API 文档');
    content = content.replace(/^## Packages$/m, '## 包列表');
    content = content.replace(/^\| Package \| Description \|$/m, '| 包 | 说明 |');

    if (!content.includes('这里收录各包的自动生成 API 参考。')) {
      content = content.replace(
        /^# API 文档$/m,
        '# API 文档\n\n这里收录各包的自动生成 API 参考。建议先从文档主页理解模型、查询和适配器边界，再回到这里查具体类型与方法签名。'
      );
    }

    for (const [pkg, description] of Object.entries(apiPackageDescriptions)) {
      const pattern = new RegExp(
        `^\\| \\[${escapeRegExp(pkg)}\\]\\(${escapeRegExp(pkg)}\\/README\\.md\\) \\| - \\|$`,
        'gm'
      );
      content = content.replace(pattern, `| [${pkg}](${pkg}/README.md) | ${description} |`);
    }

    if (content !== originalContent) {
      await writeFile(docPath, content, 'utf-8');
      console.log(`  ✓ ${candidate}`);
    }
  }
}

async function flattenApiDocs() {
  console.log('🚀 开始扁平化 API 文档结构...');

  // 检查 @aiao 目录是否存在
  const needsFlatten = existsSync(scopeDir);

  if (needsFlatten) {
    // 读取 @aiao 下的所有包目录
    const packages = await readdir(scopeDir);
    console.log(`📦 找到 ${packages.length} 个包：`, packages.join(', '));

    // 移动每个包到上层目录
    for (const pkg of packages) {
      const sourcePath = join(scopeDir, pkg);
      const targetPath = join(apiDir, pkg);

      console.log(`📁 移动: @aiao/${pkg} -> ${pkg}`);
      await rename(sourcePath, targetPath);
    }

    // 删除空的 @aiao 目录
    await rm(scopeDir, { recursive: true, force: true });
    console.log('🗑️  删除空目录: @aiao');
  } else {
    console.log('✅ @aiao 目录不存在，跳过移动步骤');
  }

  console.log('📝 修复 API 首页链接与文案...');
  await postProcessRootDocs();

  // 为每个包目录添加 _category_.json 文件（设置默认折叠）
  console.log('📝 生成 _category_.json 文件...');
  const categoryConfig = JSON.stringify({ collapsed: true }, null, 2);

  // 递归函数：为目录及其所有子目录添加 _category_.json
  async function addCategoryFiles(dirPath) {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const subDirPath = join(dirPath, entry.name);
        const categoryPath = join(subDirPath, '_category_.json');

        // 写入 _category_.json
        await writeFile(categoryPath, categoryConfig, 'utf-8');

        // 计算相对路径用于日志输出
        const relativePath = relative(apiDir, subDirPath);
        console.log(`  ✓ ${relativePath}/_category_.json`);

        // 递归处理子目录
        await addCategoryFiles(subDirPath);
      }
    } catch (error) {
      console.error(`❌ 处理目录时出错: ${dirPath}`, error);
      throw error;
    }
  }

  await addCategoryFiles(apiDir);

  // 修复 Markdown 文件中的 HTML 实体编码
  console.log('🔧 修复 HTML 实体编码...');
  await fixHtmlEntities(apiDir);

  console.log('✅ API 文档结构扁平化完成！');
}

// 递归处理所有 .md 文件，修复标题
async function fixHtmlEntities(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      await fixHtmlEntities(fullPath);
    } else if (entry.name.endsWith('.md')) {
      let content = await readFile(fullPath, 'utf-8');
      const originalContent = content;

      // 移除标题中的类型前缀（Class:, Interface:, Enumeration:, Type Alias:, Function:, Abstract Class:）
      // 这些前缀已经在目录结构中体现，标题中是冗余的
      content = content.replace(
        /^# (Abstract Class|Class|Interface|Enumeration|Type Alias|Function|Variable): /gm,
        '# '
      );

      // 移除包名称中的 scope 前缀（@aiao/ → 空）
      content = content.replace(/^# @aiao\//gm, '# ');
      content = content.replaceAll('../../_media/', '../_media/');

      // 在 h1 标题中处理特殊字符
      let sidebarLabel = null;
      let hasGeneric = false;

      content = content.replace(/^# (.*)$/m, (match, title) => {
        let processedTitle = title;

        // 移除转义的下划线（\_  → _）
        processedTitle = processedTitle.replace(/\\_/g, '_');

        // 移除之前错误添加的反斜杠转义（\< → <, \> → >）
        processedTitle = processedTitle.replace(/\\</g, '<').replace(/\\>/g, '>');

        // 先解码所有 HTML 实体：一次扫描扫完，不能链式 replace。
        // 链式写法里 `&amp;` 先变成 `&`，后面的 `&quot;` / `&#39;` 会再解一次 ——
        // `&amp;quot;`（本意是字面量 `&quot;`）被解成 `"`，属于双重解码（CS-015）。
        processedTitle = processedTitle.replace(
          /&(?:lt|gt|amp|quot|#39);/g,
          entity => HTML_ENTITY_DECODE_MAP[entity]
        );

        // 移除反引号包裹（如果之前已经添加过）
        processedTitle = processedTitle.replace(/`([^`]+)`/g, '$1');

        // 检测是否包含泛型参数（如 Repository<T> 或 QueryTask<T, RT>）
        if (/<[^>]+>/.test(processedTitle)) {
          const genericMatch = processedTitle.match(/^([^<]+)(<.+>)$/);
          if (genericMatch) {
            const [, baseName, generics] = genericMatch;
            hasGeneric = true;
            // 用反引号包裹泛型部分用于 H1 显示
            processedTitle = `${baseName}\`${generics}\``;
            // Docusaurus 侧边栏会自动转义 < > 为 &lt; &gt;，无法避免
            // 为了在侧边栏中正确显示，我们将尖括号替换为等效的 Unicode 字符
            // ⟨ (U+27E8) 和 ⟩ (U+27E9) 是数学尖括号，看起来像 < > 但不会被转义
            const sidebarGenerics = generics.replace(/</g, '⟨').replace(/>/g, '⟩');
            sidebarLabel = `${baseName}${sidebarGenerics}`;
          }
        }

        return `# ${processedTitle}`;
      });

      // 修复文档正文中的混合 HTML 实体编码
      // TypeDoc 会生成类似这样的内容：
      // `Observable`&lt;`Map`&lt;`string`, `string`&gt;&gt;
      //
      // Observable<Map<string, string>> - 描述文字
      //
      // 第一行是正确的 MDX（HTML实体编码），但第二行裸露的 < > 会导致 MDX 解析失败
      // 我们需要将这些描述性文本行用代码块包裹或移除

      // 匹配形如 "Observable<...>" 的独立行（可能有描述）
      // 注意：需要支持嵌套泛型，如 Observable<Map<string, string>>
      const wrapGenericTypeLines = (text, typeAlternation) => {
        const pattern = new RegExp(`^(${typeAlternation})(<[^<\\n]+(?:<[^<\\n]+>)?[^>\\n]*>)(\\[\\])?(.*?)$`, 'gm');
        return text.replace(pattern, (match, type, generics, array, rest) => {
          // 将整行包裹在反引号中
          return `\`${type}${generics}${array || ''}\`${rest}`;
        });
      };

      // 匹配常见集合/异步类型，如 Observable<Map<string, string>>
      content = wrapGenericTypeLines(content, 'Observable|Promise|Map|Set|Array|Record');

      // 修复类似 "Omit<RxDBChange, 'id'>[]" 这样的类型（如 Supabase 中的情况）
      content = wrapGenericTypeLines(
        content,
        'Omit|Pick|Partial|Required|Readonly|Extract|Exclude|ReturnType|InstanceType'
      );

      // 修复正文中的裸对象字面量描述，避免 MDX 将 { ... } 识别为表达式
      // 例如：同步结果 { synced: number, skipped: string[] }
      content = content.replace(/^([^`\n|#>*-][^\n{}]*?) (\{[^\n]+\})$/gm, (match, prefix, objectLiteral) => {
        return `${prefix} \`${objectLiteral}\``;
      });

      // 移除 TypeDoc 生成的 README 自引用模块行，避免生成无效链接
      content = content.replace(/^\| \[\]\(README\.md\) \| - \|\n?/gm, '');

      // 将不存在的相对目录链接改为纯文本说明，避免 Docusaurus 解析为坏链
      content = content.replace(
        /完整 SQL 脚本见 \[docker\/sql\/\]\(\.\.\/\.\.\/_media\/sql\) 目录。/g,
        '完整 SQL 脚本位于 `docs/api/_media/sql/` 目录。'
      );

      // 如果标题包含泛型，添加 frontmatter 指定 sidebar_label
      if (hasGeneric && sidebarLabel) {
        // Docusaurus 侧边栏会自动转义 < > 为 &lt; &gt;
        // 所以在 frontmatter 中我们保持原始的 < > 字符
        // 但同时也移除反引号，因为 frontmatter 不需要 MDX 转义
        const cleanLabel = sidebarLabel;

        // 检查文件是否已有 frontmatter
        if (!content.startsWith('---\n')) {
          // 没有 frontmatter，在文件开头添加
          content = `---\nsidebar_label: "${cleanLabel}"\n---\n\n${content}`;
        } else {
          // 已有 frontmatter，检查是否有 sidebar_label
          const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
          if (frontmatterMatch) {
            const frontmatter = frontmatterMatch[1];
            if (!frontmatter.includes('sidebar_label:')) {
              // 在 frontmatter 中添加 sidebar_label
              const newFrontmatter = `---\n${frontmatter}\nsidebar_label: "${cleanLabel}"\n---\n`;
              content = content.replace(/^---\n[\s\S]*?\n---\n/, newFrontmatter);
            } else {
              // 更新现有的 sidebar_label
              const newFrontmatter = frontmatter.replace(/sidebar_label: ".*?"/, `sidebar_label: "${cleanLabel}"`);
              content = content.replace(/^---\n[\s\S]*?\n---\n/, `---\n${newFrontmatter}\n---\n`);
            }
          }
        }
      }
      if (content !== originalContent) {
        await writeFile(fullPath, content, 'utf-8');
        const relativePath = relative(apiDir, fullPath);
        console.log(`  ✓ ${relativePath}`);
      }
    }
  }
}

flattenApiDocs().catch(error => {
  console.error('❌ 扁平化失败:', error);
  process.exit(1);
});
