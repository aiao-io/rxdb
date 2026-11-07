/**
 * 运行时宿主的部署配置：运行方式 → 工作台来源 → 宿主页独占的源。
 *
 * 宿主源只来自这张表，不接受地址参数：宿主页能读到挂进去的项目文件，换成任意来源等于把源码交出去。
 * 宿主页反过来也只接受表里对应工作台来源的连接，静态服务按同一张表设置 `frame-ancestors`。
 */
export const RUNTIME_HOSTS: Readonly<Record<'vivari' | 'nodepod', Readonly<Partial<Record<string, string>>>>> = {
  vivari: {
    // pnpm nx serve aiao-vscode
    'http://localhost:4320': 'http://localhost:4331',
    // verify-runtimes / verify-terminal --production 的静态服务
    'http://localhost:4330': 'http://localhost:4331'
  },
  // Nodepod 是 MIT + Commons Clause，仅内部评估（US-409）
  nodepod: {
    'http://localhost:4320': 'http://localhost:4332',
    'http://localhost:4330': 'http://localhost:4332'
  }
};

/** 跑在独立源宿主页里的运行方式。 */
export type HostedRuntime = keyof typeof RUNTIME_HOSTS;

/** 当前工作台来源在部署配置里有宿主的运行方式与宿主源。 */
export function runtimeHostsFor(config: typeof RUNTIME_HOSTS, origin: string): Partial<Record<HostedRuntime, string>> {
  const hosts: Partial<Record<HostedRuntime, string>> = {};
  for (const [runtime, table] of Object.entries(config) as [HostedRuntime, Partial<Record<string, string>>][]) {
    const host = table[origin];
    if (host) hosts[runtime] = host;
  }
  return hosts;
}

/** 宿主源允许连接（嵌入）的工作台来源。 */
export const hostParents = (hosts: Readonly<Partial<Record<string, string>>>, origin: string): string[] =>
  Object.keys(hosts).filter(parent => hosts[parent] === origin);
