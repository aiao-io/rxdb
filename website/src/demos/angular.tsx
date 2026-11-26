import { DemoMicroApp } from '@site/src/components/DemoMicroApp';
import { useSiteCopy } from '@site/src/lib/locale-copy';
import Layout from '@theme/Layout';

export default function AngularDemoPage() {
  const copy = useSiteCopy();
  return (
    <Layout
      title={copy('Angular 演示')}
      description={copy('查看 RxDB 在 Angular 中的查询、实体详情、关系数据与管理页面实现')}
    >
      <DemoMicroApp
        name='rxdb-demo-angular'
        url='/demo/angular/'
        title={copy('Angular 演示')}
        basePath='/demos/angular'
      />
    </Layout>
  );
}
