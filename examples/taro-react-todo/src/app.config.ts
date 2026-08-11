export default defineAppConfig({
  pages: [
    'pages/index/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#112a2e',
    navigationBarTitleText: 'RxDB Todo',
    navigationBarTextStyle: 'white'
  },
  // 开启微信小程序按需注入，避免无用自定义组件代码在启动时被全部注入
  // https://developers.weixin.qq.com/miniprogram/dev/framework/ability/lazyload.html
  lazyCodeLoading: 'requiredComponents'
})
