/* Design-only interactions. No API calls; no claim of RxDB or file persistence. */
const templates = [
  {
    id: 'coffee',
    title: '把一杯咖啡，拍成一张好海报',
    short: '日式咖啡 · 编辑海报',
    category: '产品海报',
    description: '自然光 / 日式留白 / 产品摄影',
    prompt:
      '为一家独立咖啡店设计一张日式编辑风格海报。手冲咖啡、米白色纸张质感、清晨的柔和自然光，细腻的咖啡泡沫与玻璃反射，大面积留白，加入简洁的「慢一点，香一点」中文标题。整体安静、温暖，有生活的气息。'
  },
  {
    id: 'ceramic',
    title: '一件陶器，也有自己的年轮',
    short: '窑火年轮 · 质感静物',
    category: '产品海报',
    description: '陶瓷肌理 / 克制排版 / 细节特写',
    prompt:
      '设计一张当代陶瓷展览海报。灰色肌理背景，俯拍陶盘与白色花器，釉面如同年轮，运用克制的排版和斜射自然光，呈现朴素、安静的工艺质感。'
  },
  {
    id: 'map',
    title: '画一张可以带走的城市记忆',
    short: '城市漫游 · 手绘地图',
    category: '创意设计',
    description: '城市地图 / 美食手绘 / 旅行灵感',
    prompt:
      '为成都绘制一张温暖有趣的手绘美食地图。水彩和复古纸张，标记街道、小吃和地标，以一只可爱的大熊猫作为中心插画，加入清楚易读的中文地名。'
  },
  {
    id: 'illustration',
    title: '把平凡的日常，画成一个故事',
    short: '生活片段 · 绘本插画',
    category: '插画绘本',
    description: '手绘笔触 / 暖色纸张 / 日常叙事',
    prompt:
      '一张温暖的手绘绘本插画：妈妈和孩子在周末的水果摊前挑选苹果，复古纸张肌理，柔和暖色，自然的表情，植物细节和轻盈的笔触，营造安静又快乐的日常。'
  },
  {
    id: 'vr',
    title: '让复杂产品，变得一目了然',
    short: '产品拆解 · 视觉设计',
    category: '创意设计',
    description: '爆炸视图 / 冷色背景 / 工业美学',
    prompt:
      '一张精密的 VR 头显产品拆解海报。垂直爆炸视图，每一层零件悬浮排列，浅灰蓝背景，柔和棚拍灯光，工业设计杂志风格，旁边留出清晰的结构说明区。'
  },
  {
    id: 'portrait',
    title: '把喜欢的人，放进温柔的画里',
    short: '温柔时光 · 绘本头像',
    category: '人像头像',
    description: '绘本头像 / 柔和配色 / 温暖情绪',
    prompt:
      '创作一张绘本风格头像：母亲与小女孩亲密相拥，两个人都在微笑。彩铅和水彩的手绘质感，奶油色背景，柔和的粉色与蓝色，让画面充满温暖。'
  }
];
let currentTemplate = templates[0],
  category = '全部灵感',
  search = '',
  ratio = 'portrait',
  view = 'discover';
let prompt = currentTemplate.prompt,
  mode = 'success',
  feedbackRating = '',
  demoWorks = templates.slice(0, 3),
  demoSaved = true;
let toastTimer;
const main = document.getElementById('main');
const asset = t => `assets/${t.id}.jpg`;
const escapeHtml = s =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 2600);
}
function card(t, library = false) {
  return `<article class="card ${library ? 'library-card' : ''}"><button class="card-link" data-template="${t.id}" aria-label="查看${t.title}"><div class="card-photo"><img class="card-image" src="${asset(t)}" alt="${t.short}的参考示例"><span class="tag">${library ? '演示作品' : t.category}</span></div><div class="card-caption"><div class="card-title">${library ? t.short : t.title}<span>↗</span></div><p>${library ? '演示记录 · 保存在本机的交互示意' : t.description}</p></div></button>${library ? `<div class="work-actions"><a href="${asset(t)}" download="aiao-design-sample-${t.id}.jpg">↓ 下载示例</a><button data-reuse="${t.id}">复用提示词</button><button data-delete="${t.id}" aria-label="删除${t.short}演示记录">删除</button></div>` : ''}</article>`;
}
function discover() {
  return `<section class="hero"><div><span class="eyebrow">A LITTLE INSPIRATION. A NEW CREATION.</span><h1>让好灵感，<br>变成<em>好图片。</em></h1><p>从一张喜欢的图片出发，用你的想法，创作下一张。</p><div class="hero-actions"><button class="primary" data-action="new">开始创作 <span>↗</span></button><span class="plain">或从下面挑一个灵感</span></div></div><div class="hero-note"><span class="number">01</span><p>找到灵感，写下想法。<br>剩下的，交给想象力。</p></div></section><div class="gallery-tools"><div class="categories">${['全部灵感', '产品海报', '人像头像', '插画绘本', '创意设计'].map(c => `<button data-category="${c}" class="${category === c ? 'active' : ''}">${c}</button>`).join('')}</div><label class="search"><span aria-hidden="true">⌕</span><input id="search" placeholder="搜索风格、场景、关键词" aria-label="搜索灵感" value="${escapeHtml(search)}"></label></div><div class="gallery-label"><strong>为你的下一次创作，找一点灵感</strong><span>编辑精选 · 参考示例</span></div><div class="cards" id="gallery-cards">${filteredCards()}</div><p class="source-note">设计示例选自 YouMind OpenLab 提示词合集，原作者与来源见卡片详情。示例图片用于界面评审，不是本产品生成结果。</p>`;
}
function filteredCards() {
  return (
    templates
      .filter(
        t =>
          (category === '全部灵感' || t.category === category) &&
          `${t.title} ${t.description} ${t.category}`.includes(search)
      )
      .map(t => card(t))
      .join('') || '<p class="no-results">没有找到相关灵感，试试其他关键词。</p>'
  );
}
function result() {
  const header = `<div class="result-toolbar"><span>画布预览</span><span class="saved-badge">${
    mode === 'success' ?
      demoSaved ? '已保存到本机 · 演示'
      : '演示结果可下载'
    : mode === 'loading' ? '正在创作'
    : mode === 'empty' ? '等待你的第一个想法'
    : mode === 'storage-error' ? '保存未完成'
    : '生成未完成'
  }</span></div>`;
  if (mode === 'loading')
    return (
      header +
      `<div class="state-content"><div class="spinner"></div><h2 class="state-title">让灵感慢慢显影</h2><p class="state-copy">正在生成图片，可能需要几十秒到数分钟。<br>请保留当前页面，不要重复提交。</p><div class="pulse-line"></div><small class="state-copy">实际等待时间取决于生成服务</small></div>`
    );
  if (mode === 'error')
    return (
      header +
      `<div class="state-content"><div class="failure-icon">!</div><h2 class="state-title">这次图片没有生成成功</h2><p class="state-copy">生成服务暂时不可用。你的提示词还在，<br>稍后可以再次尝试。</p><button class="secondary" data-action="retry">重新生成 ↗</button></div>`
    );
  if (mode === 'unknown')
    return (
      header +
      `<div class="state-content"><div class="failure-icon">…</div><h2 class="state-title">连接中断，正在确认结果</h2><p class="state-copy">服务可能已经开始生成。先查询原任务，避免重复提交产生额外用量。</p><button class="secondary" data-action="check">查询原任务状态 ↗</button></div>`
    );
  if (mode === 'empty')
    return (
      header +
      `<div class="empty-state"><div class="empty-icon">✧</div><h2>下一张好图片，从这里开始</h2><p>写下你想看到的画面，<br>也可以先从灵感库选一个模板。</p><button class="secondary" data-go="discover">去找一点灵感 ↗</button></div>`
    );
  return (
    header +
    `${mode === 'storage-error' ? '<div class="danger-note">图片已生成，本机空间不足，尚未保存。请先下载，再释放空间重试保存。</div>' : ''}<div class="result-art"><img src="${asset(currentTemplate)}" alt="${currentTemplate.short}设计示例"><span class="sample-tag">参考示例 · 未调用生成 API</span></div><div class="result-bottom"><div><strong>${currentTemplate.short}</strong><small>${
      ratio === 'square' ? '正方形'
      : ratio === 'landscape' ? '横向'
      : '纵向'
    }画幅 · 单张图片 · 示例预览</small></div><div class="result-actions">${mode === 'storage-error' ? '<button class="secondary" data-action="save">重试保存</button>' : '<button class="secondary" data-action="feedback">反馈效果</button>'}<a class="primary" href="${asset(currentTemplate)}" download="aiao-design-sample-${currentTemplate.id}.jpg">↓ 下载示例</a></div></div>`
  );
}
function studio() {
  return `<section class="studio-heading"><div><span class="eyebrow">YOUR NEXT IMAGE STARTS HERE</span><h1>把想法，变成画面。</h1><p>改一改提示词，让它更像你心里的样子。</p></div><div class="step-note"><span>01 找到灵感</span><b>02 生成图片</b><span>03 保存喜欢</span></div></section><div class="studio-grid"><section class="composer" aria-label="图片生成表单"><div class="panel-title">创作设置 <span class="small">每次生成 1 张</span></div><div class="template-chip"><img src="${asset(currentTemplate)}" alt=""><div>${currentTemplate.short}<span>已套用灵感提示词</span></div><button data-go="discover">更换 ↗</button></div><label class="field-label" for="prompt">描述你想要的图片 <span id="prompt-count">${prompt.length} / 2000</span></label><textarea id="prompt" class="prompt-text" maxlength="2000" placeholder="例如：清晨窗边的一杯咖啡，温暖的自然光……">${escapeHtml(prompt)}</textarea><div class="prompt-hint">试着描述主体、场景、风格和光线。</div><label class="field-label">图片画幅</label><div class="ratio-group" role="group" aria-label="图片画幅">${[
    ['square', '正方形', 'shape'],
    ['landscape', '横向', 'shape wide'],
    ['portrait', '纵向', 'shape tall']
  ]
    .map(
      ([id, title, shape]) =>
        `<button class="ratio ${ratio === id ? 'active' : ''}" data-ratio="${id}" aria-pressed="${ratio === id}"><span class="${shape}"></span>${title}</button>`
    )
    .join(
      ''
    )}</div><div class="model-note"><span>标准模式 <b>· 单张生成</b></span><span>邀请试用</span></div><button class="primary generate-button" data-action="generate" ${mode === 'loading' || mode === 'unknown' ? 'disabled' : ''}>${
    mode === 'loading' ? '◌ 正在生成…'
    : mode === 'unknown' ? '等待结果确认'
    : '✧ 生成图片'
  } <span>↗</span></button><div class="under-button">需要联网 · 成功后自动保存到当前浏览器</div></section><section class="result-panel" aria-label="生成结果" aria-live="polite">${result()}</section></div><div class="privacy-line"><span>◈ 图片保存在当前浏览器，请及时下载重要作品。</span><button data-go="library">查看我的图片 →</button></div>`;
}
function library() {
  return `<section class="library-heading"><div><span class="eyebrow">MADE BY YOU. KEPT WITH YOU.</span><h1>我的图片</h1><p>每一个想法，都值得留下来。</p></div><button class="primary" data-action="new">＋ 生成新图片</button></section><div class="library-toolbar"><div class="library-tabs"><span>全部图片 <b class="count-badge">${demoWorks.length}</b></span><span>演示记录</span></div><span class="library-notice">◈ 本机保存 · 不跨设备同步</span></div>${demoWorks.length ? `<div class="cards">${demoWorks.map(t => card(t, true)).join('')}</div><p class="source-note">此处展示作品库的设计效果。演示记录不写入数据库；正式版使用 RxDB 存储记录与本机图片文件。</p>` : '<div class="empty-state"><div class="empty-icon">▧</div><h2>这里，还差你的第一张作品</h2><p>生成成功的图片会出现在这里。<br>从一个小小的灵感开始吧。</p><button class="primary" data-action="new">开始第一张创作 ↗</button></div>'}`;
}
function render() {
  document.querySelectorAll('[data-nav]').forEach(b => {
    b.classList.toggle('active', b.dataset.nav === view);
    if (b.dataset.nav === view) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  main.innerHTML =
    view === 'discover' ? discover()
    : view === 'studio' ? studio()
    : library();
}
function navigate(next, state) {
  view = ['discover', 'studio', 'library'].includes(next) ? next : 'discover';
  if (state) mode = state;
  history.replaceState(null, '', `#${view}${view === 'studio' && mode !== 'success' ? '?state=' + mode : ''}`);
  render();
  window.scrollTo(0, 0);
}
function showTemplate(id) {
  const t = templates.find(t => t.id === id);
  const dialog = document.getElementById('template-dialog');
  const source = sources.find(s => s.id === id);
  const author = source?.author || 'YouMind 社区原作者';
  document.getElementById('template-content').innerHTML =
    `<div class="template-detail"><img src="${asset(t)}" alt="${t.short}参考示例"><div class="template-copy"><span class="eyebrow">${t.category} · 参考示例</span><h2>${t.title}</h2><p>${t.description}</p><blockquote>${t.prompt}</blockquote><small>图片作者：${escapeHtml(author.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'))}<br><a href="https://github.com/YouMind-OpenLab/awesome-gpt-image-2" target="_blank" rel="noreferrer">来源：YouMind OpenLab · CC BY 4.0</a><br>此处提示词为界面演示重新编写，图片保留原样。</small><button class="primary" data-use="${id}">用这个灵感创作 ↗</button></div></div>`;
  dialog.showModal();
}
let sources = [];
// Inline attribution also works when opening this HTML via file://.
sources = [
  {
    id: 'coffee',
    title: '### No. 100: 产品营销 - GPT-Image 日式编辑风格咖啡海报提示词',
    imageUrl: 'https://cms-assets.youmind.com/media/1791792858597_srgqdm_HUW0CEtbUAAMdv-.jpg',
    author: '[蛋黄堡](https://x.com/Hamburgerai)',
    source: '[Twitter Post](https://x.com/Hamburgerai/status/2109305774522700132)',
    bytes: 145046
  },
  {
    id: 'ceramic',
    title: '### No. 91: 产品营销 - GPT Image 2 陶瓷海报提示词：窑火年轮',
    imageUrl: 'https://cms-assets.youmind.com/media/1792397038572_lwzeqd_HU0nqwkbEAAM4Ib.jpg',
    author: '[蛋黄堡](https://x.com/Hamburgerai)',
    source: '[Twitter Post](https://x.com/Hamburgerai/status/2111481360246280259)',
    bytes: 188156
  },
  {
    id: 'map',
    title: '### No. 2: 手绘城市美食地图',
    imageUrl: 'https://cms-assets.youmind.com/media/1776662673014_nf0taw_HGRMNDybsAAGG88.jpg',
    author: '[皮皮特](https://x.com/mm_zzm44854)',
    source: '[Twitter Post](https://x.com/mm_zzm44854/status/2045861258520568230#reversed-1)',
    bytes: 382104
  },
  {
    id: 'vr',
    title: '### No. 1: VR 头显爆炸视图海报',
    imageUrl: 'https://cms-assets.youmind.com/media/1776658772018_lukyfw_HGSUfldbIAEiMWZ.jpg',
    author: '[wory＠ホッピング中](https://x.com/wory37303852)',
    source: '[Twitter Post](https://x.com/wory37303852/status/2045925660401795478#reversed-0)',
    bytes: 145789
  },
  {
    id: 'illustration',
    title: '### No. 77: 漫画 / 故事板 - 民间艺术咖啡馆学习插画',
    imageUrl: 'https://cms-assets.youmind.com/media/1789803922062_6s1yze_HSelMxHaEAAT0IW.jpg',
    author: '[Simply Ray](https://x.com/kingofdairyque)',
    source: '[Twitter Post](https://x.com/kingofdairyque/status/2100829530164277695)',
    bytes: 136086
  },
  {
    id: 'portrait',
    title: '### No. 1: 个人资料 / 头像 - 手绘绘本风格插画提示词',
    imageUrl: 'https://cms-assets.youmind.com/media/1792655532724_2oo1l7_HVNF_kAa4AAOvgY.jpg',
    author: '[Sairah](https://x.com/Sairah_0)',
    source: '[Twitter Post](https://x.com/Sairah_0/status/2113109623859536335)',
    bytes: 176578
  }
];
document.addEventListener('click', async e => {
  const b = e.target.closest('button,[data-action]');
  if (!b) return;
  if (b.classList.contains('dialog-close')) {
    b.closest('dialog').close();
    return;
  }
  if (b.dataset.nav || b.dataset.go) {
    navigate(b.dataset.nav || b.dataset.go);
    return;
  }
  if (b.dataset.category) {
    category = b.dataset.category;
    render();
    return;
  }
  if (b.dataset.template) {
    showTemplate(b.dataset.template);
    return;
  }
  if (b.dataset.use || b.dataset.reuse) {
    currentTemplate = templates.find(t => t.id === (b.dataset.use || b.dataset.reuse));
    prompt = currentTemplate.prompt;
    document.getElementById('template-dialog').close();
    navigate('studio', 'empty');
    return;
  }
  if (b.dataset.ratio) {
    ratio = b.dataset.ratio;
    render();
    return;
  }
  if (b.dataset.delete) {
    if (window.confirm('删除这条演示记录？正式版将同时删除本机图片文件。')) {
      demoWorks = demoWorks.filter(t => t.id !== b.dataset.delete);
      render();
      toast('演示记录已删除');
    }
    return;
  }
  if (b.dataset.rating) {
    feedbackRating = b.dataset.rating;
    document.querySelectorAll('[data-rating]').forEach(x => x.classList.toggle('active', x === b));
    return;
  }
  if (b.id === 'copy-feedback') {
    const text = `Aiao Images 试用反馈\n感受：${feedbackRating || '未选择'}\n建议：${document.getElementById('feedback-text').value}`;
    try {
      await navigator.clipboard.writeText(text);
      toast('反馈已复制，可粘贴给产品团队');
    } catch {
      toast('浏览器未允许复制，请选中内容手动复制');
    }
    return;
  }
  if (b.dataset.action === 'feedback') {
    document.getElementById('feedback-dialog').showModal();
    return;
  }
  if (b.dataset.action === 'new') {
    currentTemplate = templates[0];
    prompt = '';
    navigate('studio', 'empty');
    return;
  }
  if (b.dataset.action === 'generate' || b.dataset.action === 'retry') {
    if (!prompt.trim()) {
      document.getElementById('prompt').focus();
      toast('先描述一下你想生成的画面');
      return;
    }
    mode = 'loading';
    render();
    setTimeout(() => {
      mode = 'success';
      demoSaved = true;
      if (!demoWorks.some(t => t.id === currentTemplate.id)) demoWorks.unshift(currentTemplate);
      render();
      toast('生成与本机保存效果演示 · 未调用 API');
    }, 1800);
    return;
  }
  if (b.dataset.action === 'check') {
    toast('正式版查询原任务；此处展示结果待确认的设计状态');
    return;
  }
  if (b.dataset.action === 'save') {
    mode = 'success';
    demoSaved = true;
    render();
    toast('保存成功效果演示 · 未写入本机文件');
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'prompt') {
    prompt = e.target.value;
    document.getElementById('prompt-count').textContent = `${prompt.length} / 2000`;
  }
  if (e.target.id === 'search') {
    search = e.target.value;
    document.getElementById('gallery-cards').innerHTML = filteredCards();
  }
});
function fromHash() {
  const [v, q] = location.hash.slice(1).split('?');
  const state = new URLSearchParams(q).get('state');
  view = ['discover', 'studio', 'library'].includes(v) ? v : 'discover';
  mode = ['success', 'empty', 'loading', 'error', 'unknown', 'storage-error'].includes(state) ? state : 'success';
  render();
}
window.addEventListener('hashchange', fromHash);
fromHash();
