# 贡献指南

欢迎来到 RxDB 项目! 👋

我们非常感谢您对本项目的关注和贡献。本指南将帮助您了解如何参与项目开发。

## 📚 开始之前

请先阅读以下文档了解项目：

- **[AI 代理指南](AGENTS.md)** - 完整的文档导航
- **[需求管理](requirements/README.md)** - 用户故事和功能规划

## 开发原则

遵循项目开发的四大核心原则：

1. ✅ **TDD 强制** - 先写测试，再写实现
2. ✅ **跨框架一致** - Angular/React/Vue 功能和 API 必须一致
3. ✅ **代码质量** - TypeScript strict + 禁止 `any` + 零警告
4. ✅ **性能预算** - 查询 <16ms, DB <100ms, Bundle <50KB

规范性定义以 .specify/memory/constitution.md 为准，补充说明请参考 AGENTS.md 和 README.md。

## 环境安装

### 必需工具

- **Node.js** ≥ 26 (最低要求，见 `package.json` engines；`.nvmrc` 固定为 26，可用 nvm 管理版本)
- **pnpm** 10 (包管理器)
- **Git** (版本控制)

### 可选工具

- **nvm** - Node 版本管理器
- **VS Code** - 推荐的 IDE

### 安装步骤

```sh
pnpm i
```

### VS Code 插件安装

项目推荐的插件配置在 [.vscode/extensions.json](.vscode/extensions.json) 中,打开项目后 VS Code 会自动提示安装。

## 项目开发

### 断点调试

`vscode` **运行和调试** 界面直接可以启动断点调试，可以修改 [launch.json](.vscode/launch.json) 中的配置

### 集成测试

[examples](./examples) 文件夹中会包含一些集成测试的代码，主要是针对 `rxdb` 的不同平台不同方式的集成演示

### 单元测试

```sh
# 测试 rxdb 项目
pnpm nx test rxdb --watch --tui=false

# 测试 rxdb 项目并生成代码覆盖率报告（含 HTML）
pnpm nx test rxdb --coverage --tui=false

# 本地查看 HTML 报告（必须用 HTTP，不要直接用 file:// 打开 index.html）
# Istanbul 多页报告在 file:// / VS Code Simple Browser 下点进子目录会失败
pnpm coverage:serve
# 浏览器打开 http://127.0.0.1:8765/  （列出 packages/* / modules/* 全部报告）
# 也可直接定位某个包：pnpm coverage:serve rxdb
```

### e2e 测试

```sh
# 安装 Playwright 依赖
pnpm exec playwright install --with-deps --only-shell
```

## Git 使用

```sh
# 设置提交信息
git config user.name "你的名字"
git config user.email "你的邮箱"

# 设置 Git 仓库的大小写敏感
git config core.ignorecase false
```

### 分支与合并策略

- 所有更改通过 **Pull Request** 合并到 `main`
- PR 合并使用 **squash merge** 压缩为单次提交
- PR 标题使用 `pnpm commit` 生成的提交信息
- 合并后删除功能分支

详细流程请参考相关规范。

### 提交信息规范

使用 **Conventional Commits** 格式：

```text
type(scope): subject

body (可选)

Close #issue-number
```

**推荐使用 `pnpm commit` 命令生成规范的提交信息。**

详细说明请参考提交信息规范。

### 提交前检查

```sh
# 运行完整测试套件
pnpm test-all --skip-nx-cache
```

## 常用命令

完整命令列表请参考项目文档。

### 快速索引

| 任务       | 命令                            |
| ---------- | ------------------------------- |
| 安装依赖   | `pnpm install`                  |
| 运行测试   | `nx test <project> --watch`     |
| 完整检查   | `pnpm test-all --skip-nx-cache` |
| 格式化代码 | `nx format:write`               |
| 提交代码   | `pnpm commit`                   |
| 查看架构   | `nx graph`                      |

## 版本发布

### 本地测试

在发布包到 npm 之前，可以先将包发布到本地 Verdaccio 注册表进行测试。

#### 1. 启动本地注册表

```sh
nx local-registry
```

这将启动 Verdaccio 本地实例于 <http://localhost:4873>，并自动配置 pnpm/npm/yarn 的注册表指向本地。

> **注意**：关闭终端窗口（Ctrl+C）后，注册表会停止，已安装的包会被清理， registries 会恢复到原始状态。

#### 2. 构建并发布包到本地注册表

```sh
# 构建所有包
nx run-many --targets=build

# 发布到本地注册表（需要先启动 local-registry）
nx release version 0.0.1 --first-release
nx release publish --tag latest
```

#### 3. 测试已发布的包

在其他项目或测试工作区中，可以通过以下方式从本地注册表安装包：

##### pnpm

```sh
# 方式一：命令行指定注册表
pnpm add @aiao/rxdb --registry http://localhost:4873

# 方式二：项目级配置 (.npmrc)
echo "@aiao:registry=http://localhost:4873" >> .npmrc

# 方式三：全局配置
pnpm config set @aiao:registry http://localhost:4873
```

##### npm

```sh
# 方式一：命令行指定注册表
npm install @aiao/rxdb --registry http://localhost:4873

# 方式二：项目级配置 (.npmrc)
echo "@aiao:registry=http://localhost:4873" >> .npmrc

# 方式三：全局配置
npm config set @aiao:registry http://localhost:4873
```

##### bun

```sh
# 方式一：命令行指定注册表
bun add @aiao/rxdb --registry http://localhost:4873

# 方式二：项目级配置 (.npmrc)
echo "@aiao:registry=http://localhost:4873" >> .npmrc

# 方式三：全局配置
bun config set @aiao:registry http://localhost:4873
```

> **提示**：方式二（项目级 .npmrc）是推荐方式，只影响当前项目，不影响全局 npm 环境。

## 常见问题

### 依赖安装失败

```bash
# 清理缓存并重新安装
pnpm store prune
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### 测试失败

- 确保已安装所有依赖
- 检查是否有未提交的更改影响测试
- 使用 `--skip-nx-cache` 跳过缓存重新运行
- 清理 Nx 缓存：`nx reset`

### Nx 相关问题

```bash
# 清理缓存
nx reset

# 查看依赖图
nx graph

# 查看项目配置
nx show project <project-name>
```

更多故障排查请参考常见问题部分。

## 获取帮助

- 查看 [项目文档](README.md)
- 浏览 [Issues](https://github.com/aiao-io/rxdb/issues) 查找已知问题
- 提交新的 [Issue](https://github.com/aiao-io/rxdb/issues/new) 报告 bug 或建议新功能
- 加入社区讨论

## 致谢

感谢所有为项目做出贡献的开发者! 🎉
