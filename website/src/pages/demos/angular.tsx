import Layout from '@theme/Layout';
import styles from './demo.module.css';

export default function AngularDemoPage() {
  return (
    <Layout title='Angular 演示' description='查看 RxDB 在 Angular 中的查询、实体详情、关系数据与管理页面实现'>
      <iframe src='/demo/angular/' className={styles.fullscreenIframe} title='Angular 演示' />
    </Layout>
  );
}
