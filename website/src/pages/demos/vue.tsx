import Layout from '@theme/Layout';
import styles from './demo.module.css';

export default function VueDemoPage() {
  return (
    <Layout title='Vue 演示' description='查看 RxDB 在 Vue 中的查询、实体详情、关系页与文件管理实现'>
      <iframe src='/demo/vue/' className={styles.fullscreenIframe} title='Vue 演示' />
    </Layout>
  );
}
