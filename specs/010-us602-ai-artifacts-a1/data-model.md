# Data Model

PackageFact: name、description、role、hosts、slots、framework，以及可选 plugin（source/class/factory）、notes、retired（已删目录、仍在登记发布里的包）。不得记录安装依赖。
Scenario: id、description、packages、plugins（入口插件包）、slots（local/remote → backend 包）、timing。
PackageRecord: 扫描取得目录、manifest 与依赖边；角色事实由中心文件加入。
PluginRecord: 源码读取 inject，plugin:* 边闭合为插件包，adapter:* 核对情景槽位。
ReleaseSnapshot: 事实源 release 登记的 tag、version、标签树 manifests；投递过滤基于此快照。
Knowledge: version、digest、development、delivery、sample；稳定排序、不包含时间。
