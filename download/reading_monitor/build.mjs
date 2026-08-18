// 生成「廣告創意監控台 · 投放主 × Top創意」H5（自包含）。
// 数据：monitor_data.json（6 投放主；僅收錄區間內實際有領課的獨立視覺）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(__dir, 'monitor_data.json'), 'utf8'));
const mathData = JSON.parse(fs.readFileSync(path.join(__dir, 'math_data.json'), 'utf8'));
const conversionData = JSON.parse(fs.readFileSync(path.join(__dir, 'conversion_data.json'), 'utf8'));
const readingFrom = data[0]?.windowFrom || mathData[0]?.windowFrom || '—';
const readingTo = data[0]?.windowTo || mathData[0]?.windowTo || '—';
const mathFrom = mathData[0]?.windowFrom || readingFrom;
const mathTo = mathData[0]?.windowTo || readingTo;

// 投放主顺序 + 元信息
const ACCOUNTS = [
  { key: '親子愛共讀', slug: 'parent', color: '#e8862a', note: '知識分享繪本號・專注力/共讀鉤子', target: 22 },
  { key: '育兒小百科', slug: 'wiki', color: '#2d7467', note: '正向教養內容號・識字/情緒/共讀主力', target: 22 },
  { key: '輕鬆學國英數', slug: 'easy', color: '#3a7bd5', note: '國小國英數內容號・識字卡＋數學計算', target: 22 },
  { key: '繪本福利社', slug: 'pages', color: '#7a5bd0', note: 'Picture Book Club・多為計算/數學素材', target: 22 },
  { key: 'JoJo閱讀', slug: 'jojo', color: '#e0567f', note: '3-6歲互動閱讀品牌號・情緒/注音/識字', target: 22 },
  { key: 'Emily', slug: 'emily', color: '#5b8c5a', note: '媽媽號 mommy_emilylee・英語/注音檢核', target: 22 },
];

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nl2br = s => esc(s).replace(/\n/g, '<br>');
const titleOf = e => {
  // 优先用 headline[0] 简化，否则用 concept/name
  let t = (e.headlines && e.headlines[0]) ? e.headlines[0] : e.concept;
  return t;
};
const mathTitleOf = e => (e.headlines && e.headlines[0]) ? e.headlines[0] : e.name;
const conversionTitleOf = e => (e.headlines && e.headlines[0]) ? e.headlines[0] : e.name;

function accStats(items) {
  const A = items.filter(e => e.tier === 'A');
  const leads = A.reduce((s, e) => s + (e.leads || 0), 0);
  const spend = A.reduce((s, e) => s + (e.spend || 0), 0);
  const avgCpl = leads ? spend / leads : null;
  const bestCtr = A.length ? Math.max(...A.map(e => e.ctr || 0)) : null;
  return { aCount: A.length, bCount: items.length - A.length, leads, avgCpl, bestCtr };
}

function card(e) {
  const badge = `<span class="tag ta">✅ 近4月有領課</span>`;
  const chips = [];
  if (e.flags?.continuous) chips.push('持續領課');
  if (e.flags?.improving) chips.push('近期成長');
  if (e.flags?.newImproving) chips.push('新上架進步');
  if (e.variants > 1) chips.push(`${e.variants} 個投放變體已合併`);
  const chipsHtml = chips.length ? `<div class="chips">${chips.map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div>` : '';
  const trendClass = (e.recent14Leads || 0) > (e.previous14Leads || 0) ? 'up' : ((e.recent14Leads || 0) < (e.previous14Leads || 0) ? 'down' : 'flat');
  const trendArrow = trendClass === 'up' ? '↗' : trendClass === 'down' ? '↘' : '→';
  const metrics = `<div class="mrow">
         <div class="m"><b>${e.leads}</b><span>近4月領課</span></div>
         <div class="m"><b>${e.cpl != null ? '$' + e.cpl : '—'}</b><span>CPL</span></div>
         <div class="m"><b>${e.ctr != null ? e.ctr + '%' : '—'}</b><span>CTR</span></div>
       </div>
       <div class="trend ${trendClass}">
         <span>近14天 <b>${e.recent14Leads ?? 0}</b></span>
         <i>${trendArrow}</i>
         <span>前14天 <b>${e.previous14Leads ?? 0}</b></span>
       </div>${chipsHtml}`;
  const heads = (e.headlines || []).slice(0, 4).map(h => `<li>${esc(h)}</li>`).join('');
  const body = (e.bodies && e.bodies[0]) ? `<div class="copy"><span class="copy-tag">文案</span><p>${nl2br(e.bodies[0])}</p></div>` : '';
  return `
  <article class="card a" data-tier="A">
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

function mathCard(e) {
  const accountDetails = (e.accountBreakdown || [])
    .map(x => `${esc(x.account)} ${x.leads}領課`)
    .join('・');
  const chips = [];
  if (e.variants > 1) chips.push(`${e.variants} 個投放變體已合併`);
  if (e.cities?.length) chips.push(`${e.cities.length} 個縣市版已合併`);
  return `
  <article class="card a math-card" data-tier="A">
    <div class="chead"><span class="rank">#${e.rank}</span><span class="tag tm">🏆 台灣數學 Top ${mathData.length}</span></div>
    <a class="visual" href="${e.image}" target="_blank" rel="noopener"><img loading="lazy" src="${e.image}" alt="${esc(mathTitleOf(e))}"></a>
    <div class="cbody">
      <h4>${esc(mathTitleOf(e))}</h4>
      <div class="owner"><span>投放主</span><b>${esc(e.account)}</b>${accountDetails ? `<small>${accountDetails}</small>` : ''}</div>
      <div class="mrow">
        <div class="m"><b>${e.leads}</b><span>近2月領課</span></div>
        <div class="m"><b>${e.ctr != null ? e.ctr + '%' : '—'}</b><span>CTR</span></div>
        <div class="m"><b>${e.cpl != null ? '$' + e.cpl : '—'}</b><span>CPL</span></div>
      </div>
      ${chips.length ? `<div class="chips">${chips.map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div>` : ''}
      ${(e.headlines || []).length ? `<div class="sec">標題</div><ul class="titles">${e.headlines.slice(0, 4).map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
      ${(e.bodies && e.bodies[0]) ? `<div class="copy"><span class="copy-tag">文案</span><p>${nl2br(e.bodies[0])}</p></div>` : ''}
    </div>
  </article>`;
}

function conversionCard(e) {
  const chips = ['Arkio 廣告組歸因'];
  if (e.creativeVariants > 1) chips.push(`${e.creativeVariants} 個素材共同歸因`);
  if (e.convertedAdsets > 1) chips.push(`${e.convertedAdsets} 個同視覺廣告組已合併`);
  return `
  <article class="card a conversion-card" data-tier="purchase">
    <div class="chead"><span class="rank">#${e.rank}</span><span class="tag tc">💳 實際購課</span></div>
    <a class="visual" href="${e.image}" target="_blank" rel="noopener"><img loading="lazy" src="${e.image}" alt="${esc(conversionTitleOf(e))}"></a>
    <div class="cbody">
      <h4>${esc(conversionTitleOf(e))}</h4>
      <div class="owner"><span>投放主</span><b>${esc(e.owner)}</b><small>${esc(e.adsetNames.join('・'))}</small></div>
      <div class="mrow">
        <div class="m"><b>${e.purchases}</b><span>實際購課</span></div>
        <div class="m"><b>${e.arkioLeads.toLocaleString()}</b><span>Arkio累計領課</span></div>
        <div class="m"><b>${e.conversionRate != null ? e.conversionRate + '%' : '—'}</b><span>領課→購課</span></div>
      </div>
      <div class="conversion-meta"><span>Meta ${e.metaWindowFrom}～${e.metaWindowTo}</span><b>${e.metaLeads} 領課・CTR ${e.ctr != null ? e.ctr + '%' : '—'}</b></div>
      <div class="chips">${chips.map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div>
      ${(e.headlines || []).length ? `<div class="sec">標題</div><ul class="titles">${e.headlines.slice(0, 4).map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
      ${(e.bodies && e.bodies[0]) ? `<div class="copy"><span class="copy-tag">文案</span><p>${nl2br(e.bodies[0])}</p></div>` : ''}
    </div>
  </article>`;
}

const sections = ACCOUNTS.map(acc => {
  const items = data.filter(e => e.account === acc.key).sort((a, b) => a.rank - b.rank);
  const st = accStats(items);
  const cards = items.map(card).join('\n');
  const availability = items.length < acc.target
    ? `<div class="availability">此帳號近4月只有 <b>${items.length}</b> 個實際有領課且視覺不重複的廣告，未以無成效素材補足 ${acc.target} 個。</div>`
    : '';
  return `
  <section class="acc" id="acc-${acc.slug}" data-acc="${acc.slug}" style="--ac:${acc.color}">
    <div class="acc-head">
      <div class="acc-title"><h2>${esc(acc.key)}</h2><p>${esc(acc.note)}</p></div>
      <div class="acc-kpis">
        <div class="k"><b>${items.length}/${acc.target}</b><span>有效創意／目標</span></div>
        <div class="k"><b>${st.aCount}</b><span>實際有領課</span></div>
        <div class="k"><b>${st.leads.toLocaleString()}</b><span>近4月領課</span></div>
        <div class="k"><b>${st.avgCpl != null ? '$' + st.avgCpl.toFixed(1) : '—'}</b><span>加權CPL</span></div>
        <div class="k"><b>${st.bestCtr != null ? st.bestCtr + '%' : '—'}</b><span>最佳CTR</span></div>
      </div>
    </div>
    ${availability}
    <div class="grid">${cards || '<div class="empty">近4月沒有可歸屬領課的獨立視覺。</div>'}</div>
  </section>`;
}).join('\n');

const totalLeads = data.filter(e => e.tier === 'A').reduce((s, e) => s + (e.leads || 0), 0);
const totalA = data.filter(e => e.tier === 'A').length;
const mathLeads = mathData.reduce((sum, e) => sum + (e.leads || 0), 0);
const mathSpend = mathData.reduce((sum, e) => sum + (e.spend || 0), 0);
const mathImpressions = mathData.reduce((sum, e) => sum + (e.impressions || 0), 0);
const mathClicks = mathData.reduce((sum, e) => sum + (e.clicks || 0), 0);
const mathCpl = mathLeads ? mathSpend / mathLeads : null;
const mathCtr = mathImpressions ? mathClicks / mathImpressions * 100 : null;
const conversionPurchases = conversionData.reduce((sum, e) => sum + (e.purchases || 0), 0);
const conversionArkioLeads = conversionData.reduce((sum, e) => sum + (e.arkioLeads || 0), 0);
const conversionRate = conversionArkioLeads ? conversionPurchases / conversionArkioLeads * 100 : null;
const convertedAdsets = conversionData.reduce((sum, e) => sum + (e.convertedAdsets || 1), 0);
const conversionUpdatedAt = conversionData[0]?.arkioUpdatedAt || null;
const conversionSection = `
  <section class="acc conversion-acc" id="acc-conversion" data-acc="conversion" style="--ac:#7c3aed">
    <div class="acc-head">
      <div class="acc-title"><h2>實際購課轉化廣告</h2><p>Arkio 領課來源回溯至 H5 實際訂閱／購課</p></div>
      <div class="acc-kpis">
        <div class="k"><b>${convertedAdsets}</b><span>購課廣告組</span></div>
        <div class="k"><b>${conversionData.length}</b><span>獨立代表視覺</span></div>
        <div class="k"><b>${conversionPurchases}</b><span>實際購課</span></div>
        <div class="k"><b>${conversionArkioLeads.toLocaleString()}</b><span>Arkio累計領課</span></div>
        <div class="k"><b>${conversionRate != null ? conversionRate.toFixed(2) + '%' : '—'}</b><span>領課→購課率</span></div>
      </div>
    </div>
    <div class="conversion-note"><b>購課口徑：</b>台灣閱讀／數學 H5 的 Arkio <code>h5_funnel.subs_total</code>，只列購課大於 0 的廣告組；依購課數排序，同數時以轉化率較高者優先。Arkio 目前只能歸因到廣告組，多素材廣告組以 Meta 領課較多的素材作為代表圖，並在卡片標示共同歸因。${conversionUpdatedAt ? ` Arkio 更新時間：${esc(conversionUpdatedAt)}。` : ''}</div>
    <div class="grid">${conversionData.map(conversionCard).join('\n')}</div>
  </section>`;
const mathSection = `
  <section class="acc math-acc" id="acc-math" data-acc="math" style="--ac:#c14f30">
    <div class="acc-head">
      <div class="acc-title"><h2>台灣數學廣告 Top ${mathData.length}</h2><p>近兩個月領課最多・排除購課與閱讀區已入選視覺</p></div>
      <div class="acc-kpis">
        <div class="k"><b>${mathData.length}</b><span>獨立視覺</span></div>
        <div class="k"><b>${mathLeads.toLocaleString()}</b><span>近2月領課</span></div>
        <div class="k"><b>${mathCpl != null ? '$' + mathCpl.toFixed(1) : '—'}</b><span>加權CPL</span></div>
        <div class="k"><b>${mathCtr != null ? mathCtr.toFixed(2) + '%' : '—'}</b><span>加權CTR</span></div>
      </div>
    </div>
    <div class="math-note">範圍：SMART BEAN-TW01 台灣投放帳號，${mathFrom} → ${mathTo}。以 Meta initiate_checkout 排名；同一視覺跨縣市或不同投放主已合併領課，並排除購課轉化與閱讀帳號區已入選的視覺，確保整個監控台不重複。</div>
    <div class="grid">${mathData.map(mathCard).join('\n')}</div>
  </section>`;
const nav = ACCOUNTS.map(a => {
  const n = data.filter(e => e.account === a.key).length;
  return `<a href="#acc-${a.slug}" style="--ac:${a.color}">${esc(a.key)} <b>${n}</b></a>`;
}).join('');
const fullNav = `<a href="#acc-conversion" style="--ac:#7c3aed">實際購課 <b>${conversionPurchases}</b></a><a href="#acc-math" style="--ac:#c14f30">台灣數學 Top <b>${mathData.length}</b></a>${nav}`;
const genDate = process.env.GEN_DATE || mathTo;

const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,">
<title>廣告創意監控台 · 實際購課 × 閱讀 × 台灣數學 ｜ Rose Rose</title>
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
  .tm{background:#fff0e9;color:#b84326;border:1px solid #f2c5b5}
  .tc{background:#f2eaff;color:#6530bd;border:1px solid #d9c4fa}
  .visual{display:block;margin:10px 12px 0;border-radius:9px;overflow:hidden;border:1px solid var(--line);background:#faf7f2;cursor:zoom-in}
  .visual img{width:100%;display:block;aspect-ratio:1/1;object-fit:cover}
  .cbody{padding:10px 12px 13px}
  .cbody h4{margin:0 0 8px;font-size:13.5px;line-height:1.35}
  .owner{background:#fff7f2;border:1px solid #f0d8cd;border-radius:8px;padding:7px 9px;margin-bottom:7px}
  .owner span{display:block;font-size:9.5px;color:var(--muted)}.owner b{display:block;font-size:12.5px;color:#9f3f27}
  .owner small{display:block;font-size:10px;color:var(--muted);margin-top:2px}
  .mrow{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
  .mrow .m{background:#f5f8fb;border:1px solid var(--line);border-radius:8px;padding:6px 3px;text-align:center}
  .mrow .m b{display:block;font-size:14px;color:var(--ac)}.mrow .m span{font-size:9.5px;color:var(--muted)}
  .trend{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:7px;border-radius:8px;padding:5px 7px;font-size:10.5px;background:#f6f8fb;color:var(--muted)}
  .trend span b{color:var(--ink);font-size:12px}.trend i{font-style:normal;font-weight:800;font-size:15px}.trend.up i{color:#168451}.trend.down i{color:#c06b27}.trend.flat i{color:#78859a}
  .chips{margin-top:6px;display:flex;gap:4px;flex-wrap:wrap}.chip{display:inline-block;background:#fff3e8;color:#c96a1b;border:1px solid #f2ddc4;border-radius:999px;font-size:10.5px;padding:1px 8px}
  .libnote{background:#f4f6f9;border:1px dashed #cfd8e3;border-radius:8px;padding:7px 9px;font-size:11.5px;color:#78859a}
  .math-note{background:#fff7f2;border:1px solid #efd5ca;border-radius:11px;padding:9px 12px;margin:-3px 0 12px;font-size:11.5px;color:#76564b}
  .conversion-note{background:#f6f0ff;border:1px solid #dccbf7;border-radius:11px;padding:10px 12px;margin:-3px 0 12px;font-size:11.5px;color:#583c7a}
  .conversion-note code{background:#eadffc;border-radius:5px;padding:1px 5px}
  .conversion-meta{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:7px;border-radius:8px;padding:5px 7px;font-size:10px;background:#f6f0ff;color:#715791}
  .conversion-meta b{font-size:10.5px;color:#583c7a;text-align:right}
  .availability,.empty{background:#fff7e8;border:1px solid #efd59d;border-radius:11px;padding:9px 12px;margin:-3px 0 12px;font-size:11.5px;color:#775b23}
  .empty{grid-column:1/-1;margin:0}
  .sec{font-size:11.5px;font-weight:700;margin:9px 0 4px;color:var(--muted)}
  ul.titles{margin:0;padding-left:16px}ul.titles li{font-size:11.8px;margin:1px 0}
  .copy{background:#f7f9fc;border:1px solid var(--line);border-radius:8px;padding:7px 9px;margin-top:8px}
  .copy-tag{display:inline-block;background:var(--ac);color:#fff;font-size:10px;border-radius:5px;padding:0 6px;margin-bottom:4px}
  .copy p{margin:0;font-size:11.5px;color:#333}
  footer{margin-top:30px;text-align:center;color:var(--muted);font-size:12px;line-height:1.8}
  @media(max-width:560px){.grid{grid-template-columns:repeat(auto-fill,minmax(155px,1fr))}header.hero h1{font-size:20px}}
</style>
</head>
<body>
<div class="wrap">
  <header class="hero">
    <h1>📊 廣告創意監控台 · 實際購課 × 閱讀 × 台灣數學</h1>
    <p>資料截至 ${genDate}。新增 Arkio 實際購課轉化模塊；閱讀帳號各以 22 個實際有領課廣告為目標，台灣數學榜依近兩個月領課排名。同圖跨城市、複本、投放主與模塊皆做視覺去重。</p>
    <div class="kpis">
      <div class="kpi"><b>${conversionPurchases}</b><span>Arkio 實際購課</span></div>
      <div class="kpi"><b>${conversionData.length}</b><span>購課代表視覺</span></div>
      <div class="kpi"><b>${data.length}</b><span>閱讀分類創意</span></div>
      <div class="kpi"><b>${mathData.length}</b><span>台灣數學 Top</span></div>
    </div>
  </header>

  <div class="method">
    <b>口徑：</b>領課＝Meta 像素 initiate_checkout；購課＝Arkio H5 後端 <code>subs_total</code>。Meta 成效資料源為 Arkio 代理 Meta Insights（廣告層級）。
    閱讀榜單依近4月領課由高至低排序，領課相同時以 CTR 較高者優先；同一底圖跨城市、複本或投放主以感知雜湊去重並合併成效。
    <b>✅ 近4月有領課</b>＝期間內至少有1次可歸屬領課；不再使用素材庫或無成效廣告補數。
    <br>閱讀區間：<b>${readingFrom} → ${readingTo}</b>，每個帳號目標 22 個；客觀不足時僅列出真實有效數量。購課模塊優先保留已轉化視覺，其餘閱讀與數學區會排除相同視覺。另有<b>台灣數學廣告 Top ${mathData.length}</b>，按近2月領課由高至低排名並標示投放主、CTR、CPL與領課；不足 20 張時不以重複或零領課素材補數。
  </div>

  <div class="toolbar">
    <nav class="accnav">${fullNav}</nav>
  </div>

${conversionSection}

${mathSection}

${sections}

  <footer>
    Rose Rose ｜ 廣告優化 · 廣告創意監控台（實際購課 × 投放主 × Top創意）<br>
    圖片點擊放大；CPL＝區間花費÷領課；購課榜依 Arkio 實際購課排序，閱讀榜依近4月領課排序，數學榜依近2月領課排序。<br>
    產出時間：${genDate}
  </footer>
</div>
</body>
</html>`;

fs.writeFileSync(path.join(__dir, 'index.html'), html.replace(/[ \t]+$/gm, ''));
console.log('built monitor |', data.length, 'creatives |', ACCOUNTS.length, 'accounts | A:', totalA);
