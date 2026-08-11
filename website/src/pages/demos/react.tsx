import Layout from '@theme/Layout';
import styles from './demo.module.css';

export default function ReactDemoPage() {
  return (
    <Layout title='React 演示' description='查看 RxDB 在 React 中的查询、实体详情、代码编辑器与分支管理实现'>
      <iframe src='/demo/react/' className={styles.fullscreenIframe} title='React 演示' />
    </Layout>
  );
}
