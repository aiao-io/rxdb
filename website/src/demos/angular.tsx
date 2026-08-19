import { DemoMicroApp } from '@site/src/components/DemoMicroApp';
import Layout from '@theme/Layout';

export default function AngularDemoPage() {
  return (
    <Layout title='Angular 演示' description='查看 RxDB 在 Angular 中的查询、实体详情、关系数据与管理页面实现'>
      <DemoMicroApp name='rxdb-demo-angular' url='/demo/angular/' title='Angular 演示' basePath='/demos/angular' />
    </Layout>
  );
}
