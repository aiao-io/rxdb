import Layout from '@theme/Layout';
import { useEffect, useRef } from 'react';
import styles from './demos/demo.module.css';

function BenchmarksIframe() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const sendTheme = () => {
    const theme = document.documentElement.getAttribute('data-theme') ?? 'light';
    iframeRef.current?.contentWindow?.postMessage({ type: 'setTheme', theme }, '*');
  };

  useEffect(() => {
    const observer = new MutationObserver(sendTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return (
    <iframe
      ref={iframeRef}
      src='/benchmarks-app/'
      className={styles.fullscreenIframe}
      title='RxDB 基准测试'
      allow='cross-origin-isolated'
      onLoad={sendTheme}
    />
  );
}

export default function BenchmarksPage() {
  return (
    <Layout title='基准测试' description='在独立运行的基准测试应用中查看 RxDB 的实时测试结果'>
      <BenchmarksIframe />
    </Layout>
  );
}
