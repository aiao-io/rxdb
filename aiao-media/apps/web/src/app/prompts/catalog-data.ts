import type { PromptTemplate } from './prompt-catalog';

// Public, original examples only. SVGs are illustrative compositions, not model outputs.
export const catalogData: PromptTemplate[] = [
  {
    id: 'minimal-perfume',
    title: '极简香水产品海报',
    purpose: '产品营销',
    style: '极简',
    tags: ['香水', 'PERFUME', '留白'],
    prompt: '为 {{产品}} 设计极简产品海报，品牌为 {{品牌}}。温暖米色背景，柔和侧光，突出 {{产品}} 的质感，画面留白。',
    image: '/prompt-art/minimal-perfume.svg',
    alt: '极简香水产品海报的项目原创构图示意，非模型生成效果',
    updatedAt: '2026-10-02',
    author: 'Aiao 编辑示例',
    source: '项目原创文字与 SVG 构图示意；非供应商生成回执',
    rights: 'aiao-original-text-and-svg',
    referenceModel: null,
    needsReference: false,
    featuredRank: 0,
    fields: [
      {
        id: 'product',
        label: '产品',
        defaultValue: '香水',
        required: true
      },
      {
        id: 'brand',
        label: '品牌',
        defaultValue: '',
        required: true
      }
    ],
    templateDocument: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '为 '
            },
            {
              type: 'templateField',
              attrs: {
                fieldId: 'product'
              }
            },
            {
              type: 'text',
              text: ' 设计极简产品海报，品牌为 '
            },
            {
              type: 'templateField',
              attrs: {
                fieldId: 'brand'
              }
            },
            {
              type: 'text',
              text: '。温暖米色背景，柔和侧光，突出 '
            },
            {
              type: 'templateField',
              attrs: {
                fieldId: 'product'
              }
            },
            {
              type: 'text',
              text: ' 的质感，画面留白。'
            }
          ]
        }
      ]
    }
  },
  {
    id: 'coffee-launch',
    title: '咖啡新品发布',
    purpose: '产品营销',
    style: '插画',
    tags: ['咖啡', '产品', '暖色'],
    prompt:
      '为独立咖啡店的新品设计视觉：陶瓷杯旁散落咖啡豆，赭石与奶油色块，轻松的手绘线条，画面上方留出标题位置，不生成任何未经授权的标志。',
    image: '/prompt-art/coffee-launch.svg',
    alt: '咖啡新品发布的项目原创构图示意，非模型生成效果',
    updatedAt: '2026-10-02',
    author: 'Aiao 编辑示例',
    source: '项目原创文字与 SVG 构图示意；非供应商生成回执',
    rights: 'aiao-original-text-and-svg',
    referenceModel: null,
    needsReference: false,
    featuredRank: 1
  },
  {
    id: 'quiet-portrait',
    title: '窗边安静的人像',
    purpose: '人像',
    style: '摄影',
    tags: ['人像', '自然光', '人物'],
    prompt:
      '一个虚构成年人物坐在窗边阅读，柔和自然光，克制的灰绿色背景，真实而温暖的表情，肩部以上构图。不要模仿具体公众人物，服装无品牌图案。',
    image: '/prompt-art/quiet-portrait.svg',
    alt: '窗边安静的人像的项目原创构图示意，非模型生成效果',
    updatedAt: '2026-10-02',
    author: 'Aiao 编辑示例',
    source: '项目原创文字与 SVG 构图示意；非供应商生成回执',
    rights: 'aiao-original-text-and-svg',
    referenceModel: null,
    needsReference: false,
    featuredRank: 2
  },
  {
    id: 'festival-poster',
    title: '城市音乐节海报',
    purpose: '海报',
    style: '几何',
    tags: ['音乐', '海报', '几何'],
    prompt:
      '城市音乐节的抽象海报，圆形、折线与大块留白，深绿和柠檬黄高对比，几何节奏呼应声音。不要输出虚构演出信息，文字由后期设计补充。',
    image: '/prompt-art/festival-poster.svg',
    alt: '城市音乐节海报的项目原创构图示意，非模型生成效果',
    updatedAt: '2026-10-02',
    author: 'Aiao 编辑示例',
    source: '项目原创文字与 SVG 构图示意；非供应商生成回执',
    rights: 'aiao-original-text-and-svg',
    referenceModel: null,
    needsReference: false,
    featuredRank: null
  },
  {
    id: 'alpine-dawn',
    title: '山谷晨光',
    purpose: '风景',
    style: '摄影',
    tags: ['山谷', '山脉', '日出'],
    prompt: '晨雾中的山谷，阳光穿透松林，远处的小木屋泛着暖光，横向构图，景深层次清晰，宁静的自然色调，无人物和水印。',
    image: '/prompt-art/alpine-dawn.svg',
    alt: '山谷晨光的项目原创构图示意，非模型生成效果',
    updatedAt: '2026-10-02',
    author: 'Aiao 编辑示例',
    source: '项目原创文字与 SVG 构图示意；非供应商生成回执',
    rights: 'aiao-original-text-and-svg',
    referenceModel: null,
    needsReference: false,
    featuredRank: null
  },
  {
    id: 'coastline',
    title: '海岸线的几何秩序',
    purpose: '风景',
    style: '几何',
    tags: ['海岸', '蓝色', '俯视'],
    prompt:
      '俯视海岸线，海水、沙滩和礁石被概括为清晰的几何形状，浅蓝、珊瑚红与米白配色，平面插画，画面简洁而富有节奏。',
    image: '/prompt-art/coastline.svg',
    alt: '海岸线的几何秩序的项目原创构图示意，非模型生成效果',
    updatedAt: '2026-10-02',
    author: 'Aiao 编辑示例',
    source: '项目原创文字与 SVG 构图示意；非供应商生成回执',
    rights: 'aiao-original-text-and-svg',
    referenceModel: null,
    needsReference: false,
    featuredRank: null
  },
  {
    id: 'ceramic-still',
    title: '陶器静物',
    purpose: '产品营销',
    style: '摄影',
    tags: ['陶器', '器物', '静物'],
    prompt: '手作陶罐与一枝野花，深棕木台，侧窗自然光，突出不均匀釉色和触感。无商标，克制构图，产品表面保持干净。',
    image: '/prompt-art/ceramic-still.svg',
    alt: '陶器静物的项目原创构图示意，非模型生成效果',
    updatedAt: '2026-10-02',
    author: 'Aiao 编辑示例',
    source: '项目原创文字与 SVG 构图示意；非供应商生成回执',
    rights: 'aiao-original-text-and-svg',
    referenceModel: null,
    needsReference: false,
    featuredRank: null
  },
  {
    id: 'reading-portrait',
    title: '阅读者的剪纸肖像',
    purpose: '人像',
    style: '插画',
    tags: ['阅读', '剪纸', '书籍'],
    prompt:
      '虚构成年阅读者的半身剪纸插画，书本、眼镜、落叶作为叙事元素，奶油白背景，绿色与橙色剪纸形状，非特定人物肖像。',
    image: '/prompt-art/reading-portrait.svg',
    alt: '阅读者的剪纸肖像的项目原创构图示意，非模型生成效果',
    updatedAt: '2026-10-02',
    author: 'Aiao 编辑示例',
    source: '项目原创文字与 SVG 构图示意；非供应商生成回执',
    rights: 'aiao-original-text-and-svg',
    referenceModel: null,
    needsReference: false,
    featuredRank: null
  },
  {
    id: 'botanical-poster',
    title: '植物研究海报',
    purpose: '海报',
    style: '极简',
    tags: ['植物', '研究', '花卉'],
    prompt:
      '一张植物研究主题海报，以单枝叶片为中心，细线描绘叶脉，浅灰纸纹背景，大幅留白，理性的黑色线条与小块黄色强调，不生成虚构科学标签。',
    image: '/prompt-art/botanical-poster.svg',
    alt: '植物研究海报的项目原创构图示意，非模型生成效果',
    updatedAt: '2026-10-02',
    author: 'Aiao 编辑示例',
    source: '项目原创文字与 SVG 构图示意；非供应商生成回执',
    rights: 'aiao-original-text-and-svg',
    referenceModel: null,
    needsReference: false,
    featuredRank: null
  },
  {
    id: 'night-city',
    title: '霓虹雨夜街道',
    purpose: '风景',
    style: '摄影',
    tags: ['城市', '街道', '霓虹'],
    prompt:
      '雨夜的虚构城市街道，霓虹灯倒映在路面，复古胶片颗粒与广角构图，蓝色与暖橙交错，街道无人，不包含真实商标或可辨认的门牌。',
    image: '/prompt-art/night-city.svg',
    alt: '霓虹雨夜街道的项目原创构图示意，非模型生成效果',
    updatedAt: '2026-10-02',
    author: 'Aiao 编辑示例',
    source: '项目原创文字与 SVG 构图示意；非供应商生成回执',
    rights: 'aiao-original-text-and-svg',
    referenceModel: null,
    needsReference: false,
    featuredRank: null
  },
  {
    id: 'structured-poster',
    title: '结构化配色提示词',
    purpose: '海报',
    style: '几何',
    tags: ['JSON', '结构化', '色彩'],
    prompt:
      '{\n  "subject": "抽象海报",\n  "palette": [\n    "#10A37F",\n    "#FFE66D",\n    "#211D16"\n  ],\n  "composition": "几何图形与留白",\n  "avoid": [\n    "品牌标志",\n    "水印"\n  ]\n}',
    image: '/prompt-art/structured-poster.svg',
    alt: '结构化配色提示词的项目原创构图示意，非模型生成效果',
    updatedAt: '2026-10-02',
    author: 'Aiao 编辑示例',
    source: '项目原创文字与 SVG 构图示意；非供应商生成回执',
    rights: 'aiao-original-text-and-svg',
    referenceModel: null,
    needsReference: false,
    featuredRank: null
  },
  {
    id: 'product-reference',
    title: '产品外观参考练习',
    purpose: '产品营销',
    style: '极简',
    tags: ['参考图', '产品'],
    prompt:
      '基于用户有权使用的产品参考图设计极简海报，保留产品轮廓与结构，以浅灰背景和柔和阴影突出主体。不以目录示意图代替用户参考图。',
    image: '/prompt-art/product-reference.svg',
    alt: '产品外观参考练习的项目原创构图示意，非模型生成效果',
    updatedAt: '2026-10-02',
    author: 'Aiao 编辑示例',
    source: '项目原创文字与 SVG 构图示意；非供应商生成回执',
    rights: 'aiao-original-text-and-svg',
    referenceModel: null,
    needsReference: true,
    featuredRank: null
  }
];
