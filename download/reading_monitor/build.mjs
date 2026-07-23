// 生成「廣告創意監控台 · 投放主 × Top創意」H5（自包含）。
// 数据：monitor_data.json（6 投放主；A=近2月實際領課，B=素材庫參考）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(__dir, 'monitor_data.json'), 'utf8'));

// 投放主顺序 + 元信息
const ACCOUNTS = [
  { key: '親子愛共讀', slug: 'parent', color: '#e8862a', note: '知識分享繪本號・專注力/共讀鉤子' },
  { key: '育兒小百科', slug: 'wiki', color: '#2d7467', note: '正向教養內容號・識字/情緒/共讀主力' },
  { key: '輕鬆學國英數', slug: 'easy', color: '#3a7bd5', note: '國小國英數內容號・識字卡＋數學計算' },
  { key: '繪本福利社', slug: 'pages', color: '#7a5bd0', note: 'Picture Book Club・多為計算/數學素材' },
  { key: 'JoJo閱讀', slug: 'jojo', color: '#e0567f', note: '3-6歲互動閱讀品牌號・情緒/注音/識字' },
  { key: 'Emily', slug: 'emily', color: '#5b8c5a', note: '媽媽號 mommy_emilylee・英語/注音檢核' },
];

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nl2br = s => esc(s).replace(/\n/g, '<br>');
const titleOf = e => {
  // 优先用 headline[0] 简化，否则用 concept/name
  let t = (e.headlines && e.headlines[0]) ? e.headlines[0] : e.concept;
  return t;
};

function accStats(items) {
  const A = items.filter(e => e.tier === 'A');
  const leads = A.reduce((s, e) => s + (e.leads || 0), 0);
  const spend = A.reduce((s, e) => s + (e.spend || 0), 0);
  const avgCpl = leads ? spend / leads : null;
  const bestCtr = A.length ? Math.max(...A.map(e => e.ctr || 0)) : null;
  return { aCount: A.length, bCount: items.length - A.length, leads, avgCpl, bestCtr };
}

function card(e) {
  const isA = e.tier === 'A';
  const badge = isA
    ? `<span class="tag ta">✅ 近2月有領課</span>`
    : `<span class="tag tb">📁 素材庫參考</span>`;
  const chips = [];
  if (isA && e.flags?.continuous) chips.push('持續領課');
  if (isA && e.flags?.improving) chips.push('近期成長');
  if (isA && e.flags?.newImproving) chips.push('新上架進步');
  if (isA && e.variants > 1) chips.push(`${e.variants} 個投放變體已合併`);
  const chipsHtml = chips.length ? `<div class="chips">${chips.map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div>` : '';
  const trendClass = (e.recent14Leads || 0) > (e.previous14Leads || 0) ? 'up' : ((e.recent14Leads || 0) < (e.previous14Leads || 0) ? 'down' : 'flat');
  const trendArrow = trendClass === 'up' ? '↗' : trendClass === 'down' ? '↘' : '→';
  const metrics = isA
    ? `<div class="mrow">
         <div class="m"><b>${e.leads}</b><span>近2月領課</span></div>
         <div class="m"><b>${e.cpl != null ? '$' + e.cpl : '—'}</b><span>CPL</span></div>
         <div class="m"><b>${e.ctr != null ? e.ctr + '%' : '—'}</b><span>CTR</span></div>
       </div>
       <div class="trend ${trendClass}">
         <span>近14天 <b>${e.recent14Leads ?? 0}</b></span>
         <i>${trendArrow}</i>
         <span>前14天 <b>${e.previous14Leads ?? 0}</b></span>
       </div>${chipsHtml}`
    : `<div class="libnote">素材庫創意・近2月無可歸屬成效，僅供視覺與文案迭代參考</div>`;
  const heads = (e.headlines || []).slice(0, 4).map(h => `<li>${esc(h)}</li>`).join('');
  const body = (e.bodies && e.bodies[0]) ? `<div class="copy"><span class="copy-tag">文案</span><p>${nl2br(e.bodies[0])}</p></div>` : '';
  return `
  <article class="card ${isA ? 'a' : 'b'}" data-tier="${e.tier}">
    <div class="chead"><span class="rank">#${e.rank}</span>${badge}</div>
    <a class="visual" href="${e.image}" target="_blank" rel="noopener"><img loading="lazy" src="${e.image}" alt="${esc(titleOf(e))}"></a>
    <div class="cbody">
      <h4>${esc(titleOf(e))}</h4>
      ${metrics}
      ${heads ? `<div class="sec">標題</div><ul class="titles">${heads}</ul>` : ''}
      ${body}
    </div>
  </article>`;
}

const sections = ACCOUNTS.map(acc => {
  const items = data.filter(e => e.account === acc.key).sort((a, b) => a.rank - b.rank);
  const st = accStats(items);
  const cards = items.map(card).join('\n');
  return `
  <section class="acc" id="acc-${acc.slug}" data-acc="${acc.slug}" style="--ac:${acc.color}">
    <div class="acc-head">
      <div class="acc-title"><h2>${esc(acc.key)}</h2><p>${esc(acc.note)}</p></div>
      <div class="acc-kpis">
        <div class="k"><b>${items.length}</b><span>創意</span></div>
        <div class="k"><b>${st.aCount}</b><span>實際有領課</span></div>
        <div class="k"><b>${st.leads.toLocaleString()}</b><span>近2月領課</span></div>
        <div class="k"><b>${st.avgCpl != null ? '$' + st.avgCpl.toFixed(1) : '—'}</b><span>加權CPL</span></div>
        <div class="k"><b>${st.bestCtr != null ? st.bestCtr + '%' : '—'}</b><span>最佳CTR</span></div>
      </div>
    </div>
    <div class="grid">${cards}</div>
  </section>`;
}).join('\n');

const totalLeads = data.filter(e => e.tier === 'A').reduce((s, e) => s + (e.leads || 0), 0);
const totalA = data.filter(e => e.tier === 'A').length;
const nav = ACCOUNTS.map(a => {
  const n = data.filter(e => e.account === a.key).length;
  return `<a href="#acc-${a.slug}" style="--ac:${a.color}">${esc(a.key)} <b>${n}</b></a>`;
}).join('');
const genDate = process.env.GEN_DATE || '2026-07-23';

const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,">
<title>廣告創意監控台 · 投放主 × Top創意 ｜ Rose Rose</title>
<style>
  :root{--bg:#eef1f6;--ink:#1a2330;--muted:#6a7889;--line:#e0e6ee;--panel:#fff;--shadow:0 10px 30px rgba(20,35,60,.08);}
  *{box-sizing:border-box}html,body{margin:0}
  body{background:var(--bg);color:var(--ink);line-height:1.55;-webkit-text-size-adjust:100%;
    font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif}
  .wrap{max-width:1240px;margin:0 auto;padding:18px 16px 70px}
  header.hero{background:linear-gradient(120deg,#1f3a5f,#2d7467);color:#fff;border-radius:20px;padding:24px 24px;box-shadow:var(--shadow)}
  header.hero h1{margin:0 0 6px;font-size:23px}
  header.hero p{margin:2px 0;font-size:13px;opacity:.94;max-width:900px}
  .kpis{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}
  .kpi{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.26);border-radius:13px;padding:9px 15px;flex:1;min-width:110px}
  .kpi b{display:block;font-size:20px}.kpi span{font-size:11.5px;opacity:.9}
  .method{background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:12px 16px;margin:14px 0;font-size:12.5px;color:var(--muted)}
  .method b{color:var(--ink)}
  .toolbar{position:sticky;top:0;z-index:6;background:linear-gradient(var(--bg),var(--bg) 74%,transparent);padding:10px 2px 8px;margin-bottom:4px}
  nav.accnav{display:flex;gap:7px;flex-wrap:wrap}
  nav.accnav a{text-decoration:none;color:var(--ac);background:var(--panel);border:1.5px solid var(--ac);border-radius:999px;padding:5px 12px;font-size:13px;font-weight:600}
  nav.accnav a b{background:var(--ac);color:#fff;border-radius:7px;padding:0 6px;margin-left:3px;font-size:11.5px}
  .filter{display:inline-flex;gap:4px;margin-top:8px;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:3px}
  .filter button{border:0;background:transparent;color:var(--muted);padding:5px 12px;font-size:12.5px;border-radius:7px;cursor:pointer}
  .filter button.on{background:var(--ink);color:#fff}
  .acc{margin-top:22px;scroll-margin-top:64px}
  .acc-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;
    border-left:5px solid var(--ac);padding:4px 0 10px 13px;margin-bottom:12px}
  .acc-title h2{margin:0;font-size:20px}
  .acc-title p{margin:2px 0 0;font-size:12.5px;color:var(--muted)}
  .acc-kpis{display:flex;gap:8px;flex-wrap:wrap}
  .acc-kpis .k{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:6px 12px;text-align:center;min-width:64px}
  .acc-kpis .k b{display:block;font-size:16px;color:var(--ac)}.acc-kpis .k span{font-size:10.5px;color:var(--muted)}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(232px,1fr));gap:14px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);overflow:hidden;display:flex;flex-direction:column}
  .card.b{opacity:.97}
  .chead{display:flex;align-items:center;gap:7px;padding:10px 12px 0}
  .rank{background:var(--ac);color:#fff;font-weight:700;font-size:12px;border-radius:7px;padding:2px 8px}
  .tag{font-size:10.5px;border-radius:6px;padding:2px 7px;font-weight:600}
  .ta{background:#e6f5ec;color:#1a8a44;border:1px solid #bfe6cc}
  .tb{background:#eef0f4;color:#6a7889;border:1px solid #dde2ea}
  .visual{display:block;margin:10px 12px 0;border-radius:9px;overflow:hidden;border:1px solid var(--line);background:#faf7f2;cursor:zoom-in}
  .visual img{width:100%;display:block;aspect-ratio:1/1;object-fit:cover}
  .cbody{padding:10px 12px 13px}
  .cbody h4{margin:0 0 8px;font-size:13.5px;line-height:1.35}
  .mrow{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
  .mrow .m{background:#f5f8fb;border:1px solid var(--line);border-radius:8px;padding:6px 3px;text-align:center}
  .mrow .m b{display:block;font-size:14px;color:var(--ac)}.mrow .m span{font-size:9.5px;color:var(--muted)}
  .trend{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:7px;border-radius:8px;padding:5px 7px;font-size:10.5px;background:#f6f8fb;color:var(--muted)}
  .trend span b{color:var(--ink);font-size:12px}.trend i{font-style:normal;font-weight:800;font-size:15px}.trend.up i{color:#168451}.trend.down i{color:#c06b27}.trend.flat i{color:#78859a}
  .chips{margin-top:6px;display:flex;gap:4px;flex-wrap:wrap}.chip{display:inline-block;background:#fff3e8;color:#c96a1b;border:1px solid #f2ddc4;border-radius:999px;font-size:10.5px;padding:1px 8px}
  .libnote{background:#f4f6f9;border:1px dashed #cfd8e3;border-radius:8px;padding:7px 9px;font-size:11.5px;color:#78859a}
  .sec{font-size:11.5px;font-weight:700;margin:9px 0 4px;color:var(--muted)}
  ul.titles{margin:0;padding-left:16px}ul.titles li{font-size:11.8px;margin:1px 0}
  .copy{background:#f7f9fc;border:1px solid var(--line);border-radius:8px;padding:7px 9px;margin-top:8px}
  .copy-tag{display:inline-block;background:var(--ac);color:#fff;font-size:10px;border-radius:5px;padding:0 6px;margin-bottom:4px}
  .copy p{margin:0;font-size:11.5px;color:#333}
  footer{margin-top:30px;text-align:center;color:var(--muted);font-size:12px;line-height:1.8}
  body.only-a .card.b{display:none}
  @media(max-width:560px){.grid{grid-template-columns:repeat(auto-fill,minmax(155px,1fr))}header.hero h1{font-size:20px}}
</style>
</head>
<body>
<div class="wrap">
  <header class="hero">
    <h1>📊 廣告創意監控台 · 投放主 × Top 創意</h1>
    <p>近兩個月實際領課優先，兼看持續領課、近14天成長與新上架進步；同圖跨城市、複本與投放主已做視覺去重。時間窗：2026-05-24 → 07-23。</p>
    <div class="kpis">
      <div class="kpi"><b>6</b><span>投放主</span></div>
      <div class="kpi"><b>${data.length}</b><span>創意內容</span></div>
      <div class="kpi"><b>${totalA}</b><span>近2月實際有領課</span></div>
      <div class="kpi"><b>${totalLeads.toLocaleString()}</b><span>成效款合計領課</span></div>
    </div>
  </header>

  <div class="method">
    <b>口徑：</b>領課＝Meta 像素 initiate_checkout，資料源＝Arkio 代理 Meta Insights（廣告層級）＋ Arkio 素材庫。
    排序先看近2月領課與CPL，再加權近14天持續領課／成長、新上架後進步；同一底圖跨城市、複本或投放主以感知雜湊去重，近似圖合併累計。
    <b>✅ 近2月有領課</b>＝期間內至少有1次可歸屬領課；<b>📁 素材庫參考</b>＝投放成效款不足目標數時，以近期獨立視覺補充，不冒充成效款。
    <br>本版共 70 個不重複視覺：<b>親子愛共讀／育兒小百科各15個</b>，其餘各10個；繪本福利社為9個成效款＋1個素材庫參考，Emily為10個素材庫參考。
  </div>

  <div class="toolbar">
    <nav class="accnav">${nav}</nav>
    <div class="filter"><button class="on" data-f="all">全部創意</button><button data-f="a">只看成效驗證</button></div>
  </div>

${sections}

  <footer>
    Rose Rose ｜ 廣告優化 · 廣告創意監控台（投放主 × Top創意）<br>
    圖片點擊放大；CPL＝區間花費÷領課；近14天與前14天用來判斷近期變化，素材庫款僅供補充參考。<br>
    產出時間：${genDate}
  </footer>
</div>
<script>
  document.querySelectorAll('.filter button').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('.filter button').forEach(x=>x.classList.remove('on'));
    b.classList.add('on');
    document.body.classList.toggle('only-a', b.dataset.f==='a');
  }));
</script>
</body>
</html>`;

fs.writeFileSync(path.join(__dir, 'index.html'), html);
console.log('built monitor |', data.length, 'creatives |', ACCOUNTS.length, 'accounts | A:', totalA);
