# 构建与验收

前置：当前锁文件 Node 26+、pnpm 12、依赖已安装；支持 IndexedDB、Web Locks、BroadcastChannel、MessageChannel 与 customElements 的桌面安全上下文。

```bash
NX_NO_CLOUD=true NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm nx serve web-desktop
NX_NO_CLOUD=true NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm nx run web-desktop:requirements-check
NX_NO_CLOUD=true NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm nx run-many -p web-desktop -t lint,typecheck,test,build --parallel=1
NX_NO_CLOUD=true NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm nx run web-desktop:test --coverage
NX_NO_CLOUD=true NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm nx run web-desktop:e2e
NX_NO_CLOUD=true NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm nx run orbit:test --coverage
```

1. 全新浏览器选择模式，进入真实空桌面；从文件管理器新建文本、编辑中文、保存、取消关闭、关闭再重开，对比文件字节。
2. 两个编辑实例保存同一文件：第二个必须冲突；切换模式 20 次不重载实例；macOS 关闭保留运行，Windows 销毁；多文档退出任一取消全部保留。
3. 移动/贴靠/最小化/还原、工作区迁移及键盘窗口菜单；axe 自动检查，真实读屏与 IME 按验收台账人工登记。
4. 拒绝能力无副作用，撤销后下一次调用立即失败；定向通信不越实例，原生数据文件不执行。
5. 正式构建准备完整离线资源，断网刷新、打开、编辑保存；破坏资源准备必须不标离线；版本切换不得混合资源。
6. 导入二进制逐字节导出、回收站恢复；损坏/超限备份不改旧状态；备份无授权、正文以外运行敏感数据。
7. 第二标签页先只读，接管须旧页统一脏状态协商；取消不移交，成功后旧页不能写。
8. 正式部署按 README 的基址、HTTPS 和缓存规则配置；版本与去敏诊断能下载。macOS/Windows 实机、10 人任务研究和基准设备采样单独记录，未取得证据不能标支持或发布完成。
