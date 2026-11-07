# 数据模型

- DesktopProfile: mode=`macos|windows`，theme=`light|dark|system`，scale=100–200%，reducedMotion、pinned appId 有序去重、shortcuts、guided、doNotDisturb；显式偏好优先于系统推断。
- Workspace: 稳定 id、非空 name、排序；至少一个，删除必须选择迁移目标。
- AppDefinition: 稳定 appId、name、version、受控 origin/entry、protocol=1、可选 suspension=1、instances=`single|multiple`、required/optional capabilities、minWidth/minHeight、fileTypes、resources（URL + SHA-256）；身份来源不可覆盖。
- AppInstallation: appId、当前 version/resourceVersion、上一 previousVersion/previousResourceVersion（SHA-256 指纹成对保存），null 仅表示尚未绑定资源；写入完整资源验证后提交；不可逆迁移无恢复方案则拒绝。
- AppInstance: 新建 instanceId、绑定 appId/version、Orbit handle、dirty、title、commands、状态、保存引用；失败重试创建新身份。macOS 无窗口仍存活。
- DesktopWindow: windowId 与 instanceId 一对一，workspaceId、bounds、normalBounds、state=`normal|minimized|maximized|left|right`、previousState、beforeMinimized；激活唯一，最小化不可聚焦。
- VirtualFile: 稳定 id、parentId、name、kind=`file|directory`、mime、Uint8Array bytes、revision 正整数、modified、deleted/originalParent；同目录名称唯一，禁止路径穿越与目录环，回收站保留字节。
- PermissionGrant: appId + approved origin + capability + scope + session instanceId（会话授权）或 persistent；授权前校验 manifest 声明，撤销后再次调用立即拒绝。
- AppData: appId + schemaVersion + key，持久设置按应用共享；schema 不兼容明确拒绝。
- SessionSnapshot: schemaVersion=4、profile、workspaces、navigation（当前工作区及每区活动窗口在有序 session 内的索引）、可恢复窗口及文件引用/路由；不包含任意未保存内存、令牌或通知。
- DesktopOwnership: Web Lock 排他拥有权；存储事务进入前验证仍持有锁，接管释放前先处理全部脏状态。
- DesktopBackup: format=`orbit-desktop`、schemaVersion=1、范围、元数据、原始字节 base64 及 SHA-256；最大 200 MiB，导出不加密，默认排除授权和敏感运行状态。

事务不变量：先验证全部输入，读取当前 revision/ownership，在同一 IndexedDB readwrite transaction 更新元数据和字节；失败回滚。恢复在一个事务中替换所选托管数据，验证失败旧状态逐字节不变。

持久化迁移：已有 v1 数据先恢复 v2 导航，再显式升级到 v3 安装记录；v2 仅增加 resourceVersion=null、previousResourceVersion=null，不伪造已下载资源，旧输入不被修改。迁移与写回位于同一个 IndexedDB 事务。旧快照没有当前工作区信息，沿用首个工作区、各区最后一个非最小化窗口为活动窗口。v3→v4 为每个窗口补齐 previousState=normal、beforeMinimized=normal；旧格式未记录的还原前态不可追溯，当前窗口状态、正常边界、路由、文件和资源指纹保持不变。当前 v4 严格验证窗口还原前态、导航、已安装入口、批准版本、资源指纹和成对的回退资源。备份外层格式仍为 schemaVersion=1；恢复先核验原始摘要，再迁移内部数据。

资源固定：每个批准的 appId/version 有独立 ReleasePackage。按入口、相对资源路径和逐资源 SHA-256 计算包指纹；完整包位于 releases/appId/version/指纹/，入口使用包内相对脚本样式。Service Worker 逐资源校验、最后写完整标记，只响应声明的资源。历史版本可按原指纹从部署归档修复；修复失败不借用其他版本资源。部署必须保留这些不可变归档。

版本切换：展示版本与必需权限差异 → 必要时先准备并固定旧版回退资源 → 完整校验目标资源 → 确认新增权限（暂不提交） → 全部目标实例关闭协商 → 在同一事务中校验当前安装并切换资源、提交显式新增授权 → 按保存引用和路由重开。任何前置取消不改安装或授权；应用迁移非 none、写入 schema 非 1 或不能读取现有数据时直接拒绝。新版本启动失败保留明确错误与上一完整包，用户可显式回退；不执行无法验证的数据逆迁移。

外壳资源协议：`status.protocol=2` 表示支持受控版本目录、独立取消、优先队列与引用清理。根路径和 index.html 指向当前完整外壳缓存；旧协议页面只提供明确更新流程。窗口快照在文档保存成功后、关闭实例前写入，保留新文件 ID、工作区及活动窗口；协议升级前尚未启动实例时保留数据库中已有的会话。

资源调度与后台状态只驻留内存：`ResourceTask` 以资源 key 去重，关联带优先级的独立等待者、AbortController 和 queued/running 状态；`ResourceReferences` 以 owner/id 记录 key，原子替换快照并计数。CacheStorage 只回收当前部署中无安装、回退、实例、临时持有、任务和活 iframe 引用的版本，不改变持久数据格式（当前 schemaVersion=4）。

`Suspension` 状态为 running/suspending/suspended/resuming/unknown。未保存和未声明协议的应用保持运行；只有应用确认保存完成才进入 suspended。恢复保留相同 iframe 与组件内存，失败显示 unknown。会话快照不存挂起状态；重开仍从持久窗口和文件引用恢复。

实例导航：AppNavigation 为每个实例维护独立的路由数组与当前索引。push 清除该实例前进分支，replace 更新当前项，前进 / 后退先由应用处理器确认再提交。SavedWindow.route 保留相对 path/query/hash，不保存历史栈；宿主顶层 URL 不参与应用导航。窗口路由更新与恢复输入均拒绝凭据、跨来源形式和越界路径，旧空路由与锚点仍接受，当前位置随 v4 会话持久化，历史栈仍只保存在实例内存。

文件应用恢复目录 / 搜索 / 选择，设置恢复页面，编辑器恢复文档与行号。失败窗口重试使用其完整 SavedWindow，而不是仅以 appId 和 fileId 重开。导航或读取期间继续编辑时，读取提交前验证文本、名称、文件身份和 revision；变化后拒绝覆盖当前文档。

窗口会话统一通过 saveWindow / restoreWindow 序列化与重建；刷新、失败项重试及应用更新 / 回退共用同一保存结构。最小化时保存 beforeMinimized，最大化时保存 previousState，恢复按新工作区计算几何并约束正常边界，不把最小化窗口设为活动窗口。

工作区顺序直接由 workspaces 数组表达，无额外 order 字段；重排只接受当前身份集合的唯一完整排列。排序不修改导航索引、窗口引用或应用内存，过期列表在原子提交前拒绝。

启动恢复提示、数据校验错误类别和重置确认状态只驻留宿主内存。受损数据保持原记录，显式两次确认后才原子替换为初始 v4；无运行实例且仍拥有写入权才能重置，写入丢权回滚。布局保存错误标明会话影响范围，已保存文件的独立事务不受布局失败影响。
