import { DemoMicroApp } from '@site/src/components/DemoMicroApp';
import { useSiteCopy } from '@site/src/lib/locale-copy';
import Layout from '@theme/Layout';

export default function VueDemoPage() {
  const copy = useSiteCopy();
  return (
    <Layout title={copy('Vue 演示')} description={copy('查看 RxDB 在 Vue 中的查询、实体详情、关系页与文件管理实现')}>
      <DemoMicroApp name='rxdb-demo-vue' url='/demo/vue/' title={copy('Vue 演示')} basePath='/demos/vue' />
    </Layout>
  );
}
