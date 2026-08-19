import { DemoMicroApp } from '@site/src/components/DemoMicroApp';
import Layout from '@theme/Layout';

export default function VueDemoPage() {
  return (
    <Layout title='Vue 演示' description='查看 RxDB 在 Vue 中的查询、实体详情、关系页与文件管理实现'>
      <DemoMicroApp name='rxdb-demo-vue' url='/demo/vue/' title='Vue 演示' />
    </Layout>
  );
}
