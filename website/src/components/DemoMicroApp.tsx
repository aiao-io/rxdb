import BrowserOnly from '@docusaurus/BrowserOnly';
import { useEffect, useState, type ComponentType, type ReactElement } from 'react';

import styles from '@site/src/pages/demos/demo.module.css';

export interface DemoMicroAppProps {
  /** 无界子应用唯一 id。 */
  name: string;
  /** 子应用入口，例如 `/demo/angular/`。 */
  url: string;
  /** 容器无障碍标题。 */
  title: string;
  /** 传给内部 iframe 的 `allow`，基准测试需要 `cross-origin-isolated`。 */
  allow?: string;
  /**
   * 宿主页在文档站里的路径前缀，例如 `/demos/vue`。
   *
   * 传了才双向同步路由：宿主 `${basePath}/todo` ←→ 子应用 `/todo`。
   * 不传则只挂载子应用，地址栏不动。
   */
  basePath?: string;
}

function ClientHost(props: DemoMicroAppProps): ReactElement | null {
  const [Client, setClient] = useState<ComponentType<DemoMicroAppProps> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import('./DemoMicroAppClient').then(mod => {
      if (!cancelled) setClient(() => mod.default);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!Client) return <div className={styles.fullscreenMicroApp} />;
  return <Client {...props} />;
}

/**
 * 文档站无界宿主：在客户端加载子应用，并把 Docusaurus `data-theme` 同步进去。
 */
export function DemoMicroApp(props: DemoMicroAppProps): ReactElement {
  return (
    <div className={styles.fullscreenMicroApp} title={props.title}>
      <BrowserOnly fallback={<div className={styles.fullscreenMicroApp} />}>
        {() => <ClientHost {...props} />}
      </BrowserOnly>
    </div>
  );
}
