import { validateCatalog, type PromptTemplate } from './prompts/prompt-catalog';
import type { PromptNode } from './prompts/prompt-state';

const items = [
  [
    'coffee',
    '把一杯咖啡，拍成一张好海报',
    '产品海报',
    '自然光 / 日式留白 / 产品摄影',
    '为一家独立咖啡店设计一张日式编辑风格海报。手冲咖啡、米白纸张质感、清晨柔和自然光，大面积留白，加入「慢一点，香一点」的中文标题。整体安静、温暖。'
  ],
  [
    'ceramic',
    '一件陶器，也有自己的年轮',
    '产品海报',
    '陶瓷肌理 / 克制排版 / 静物',
    '设计一张当代陶瓷展览海报。灰色肌理背景，俯拍陶盘与白色花器，釉面如同年轮，克制排版和斜射自然光，呈现安静的工艺质感。'
  ],
  [
    'map',
    '画一张可以带走的城市记忆',
    '创意设计',
    '城市地图 / 美食手绘 / 旅行',
    '为成都绘制一张温暖有趣的手绘美食地图。水彩与复古纸张，标记街道、小吃和地标，以可爱的大熊猫作为中心插画，加入清楚易读的中文地名。'
  ],
  [
    'illustration',
    '把平凡日常，画成一个故事',
    '插画绘本',
    '手绘笔触 / 暖色纸张 / 日常',
    '温暖的手绘绘本插画：妈妈和孩子在周末水果摊前挑选苹果，复古纸张肌理，柔和暖色，自然表情，植物细节和轻盈笔触，营造快乐的日常。'
  ],
  [
    'vr',
    '让复杂产品，变得一目了然',
    '创意设计',
    '产品拆解 / 冷色背景 / 工业美学',
    '精密的 VR 头显产品拆解海报，垂直爆炸视图，每层零件悬浮排列，浅灰蓝背景，柔和棚拍灯光，工业设计杂志风格，留出结构说明区。'
  ],
  [
    'portrait',
    '把喜欢的人，放进温柔的画里',
    '人像头像',
    '绘本头像 / 柔和配色 / 温暖',
    '创作一张绘本风格头像：母亲与小女孩亲密相拥，两个人都在微笑。彩铅与水彩手绘质感，奶油色背景，柔和粉色与蓝色，画面充满温暖。'
  ],
  [
    'minimal-perfume',
    '用留白，让产品成为主角',
    '产品海报',
    '品牌视觉 / 极简 / 产品摄影',
    '极简香水产品海报，透明玻璃瓶置于米色石材上，柔和侧光，精致的液体与玻璃细节，画面顶部留白，安静的高端杂志摄影风格。'
  ],
  [
    'coastline',
    '把海风，留在一张照片里',
    '创意设计',
    '海岸 / 电影感 / 自然',
    '一张电影感海岸风景照片，远处碧蓝海湾，近处白色岩石与绿色植物，清晨柔和金色光线，真实胶片颗粒，宁静宽阔的构图。'
  ],
  [
    'botanical-poster',
    '为植物，写一首视觉的诗',
    '插画绘本',
    '植物 / 手绘 / 自然',
    '为春日植物展创作一张手绘插画海报。细腻水彩叶片、野花与植物标本，米白纸张，绿色和浅黄色，清晰而轻盈的画面。'
  ],
  [
    'quiet-portrait',
    '一束光，讲一个人的故事',
    '人像头像',
    '自然肖像 / 光影 / 胶片',
    '创作一张自然人像，一位短发年轻人坐在窗边阅读，柔和侧光照亮面部，安静背景，真实皮肤细节，暖色胶片质感，友善平静的表情。'
  ],
  [
    'night-city',
    '收集城市，夜晚的颜色',
    '创意设计',
    '雨夜 / 霓虹 / 街头摄影',
    '雨夜的城市街道，霓虹灯倒映在路面，一位撑透明伞的行人，蓝色与暖橙色对比，纪实街头摄影，真实电影质感。'
  ],
  [
    'festival-poster',
    '给重要的日子，一张海报',
    '产品海报',
    '节日 / 平面设计 / 中文排版',
    '为秋日市集设计一张温暖的活动海报。橙色、米白与深绿配色，手绘食物、植物和手作摊位，加入清晰的「秋日好市」标题，排版简洁有趣。'
  ]
];
const authors: Record<string, string> = {
  coffee: '蛋黄堡',
  ceramic: '蛋黄堡',
  map: '皮皮特',
  vr: 'wory＠ホッピング中',
  illustration: 'Simply Ray',
  portrait: 'Sairah'
};
const base: PromptTemplate[] = items.map(([id, title, purpose, style, prompt], index) => ({
  id,
  title,
  purpose,
  style,
  tags: style.split(' / '),
  prompt,
  image: index < 6 ? `/image-examples/${id}.jpg` : `/prompt-art/${id}.svg`,
  alt: `${title} — ${index < 6 ? '社区参考示例' : '原创构图示意'}`,
  updatedAt: '2026-10-23',
  author: authors[id] ?? 'Aiao',
  source: index < 6 ? 'https://github.com/YouMind-OpenLab/awesome-gpt-image-2' : 'Aiao 原创文本与构图示意',
  rights: index < 6 ? 'community-reference' : 'aiao-original-text-and-svg',
  referenceModel: null,
  needsReference: false,
  featuredRank: index + 1
}));
// Reuse the existing parameter node; content editing does not require a template builder.
base[0].fields = [
  { id: 'product', label: '产品', defaultValue: '手冲咖啡', required: true },
  {
    id: 'headline',
    label: '标题',
    defaultValue: '慢一点，香一点',
    required: true
  }
];
base[0].templateDocument = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '设计一张日式编辑风格海报。主体是' },
        { type: 'templateField', attrs: { fieldId: 'product' } },
        {
          type: 'text',
          text: '，米白纸张质感、柔和自然光，大面积留白。中文标题是「'
        },
        { type: 'templateField', attrs: { fieldId: 'headline' } },
        { type: 'text', text: '」。整体安静、温暖，有生活的气息。' }
      ]
    }
  ]
} satisfies PromptNode;
export const imageMvpCatalog = validateCatalog(base);
