// 生成「近2个月・最佳阅读广告」H5 v2。
// 数据：reading_top20_data.json。按 情緒/識字/正音表達/其他 四类分区。
// 支持：合并组（多投放主 + 成效分列）、新增创意标记、素材库补充（无投放数据）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(__dir, '..', 'reading_top20_data.json'), 'utf8'));

const THEMES = [
  { key: '情緒', emoji: '💗', desc: '情緒覺察・脾氣・表達', color: '#e0567f' },
  { key: '識字', emoji: '📖', desc: '識字卡・學習單・常見字', color: '#2d7467' },
  { key: '正音表達', emoji: '🔤', desc: '注音・正音・發音開口', color: '#e8862a' },
  { key: '其他', emoji: '✨', desc: '福利鉤子・測評・繪本推薦', color: '#5b6c9a' },
];

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nl2br = s => esc(s).replace(/\n/g, '<br>');

const totalLeads = data.reduce((s, d) => s + (d.leadsTotal || 0), 0);
const newCount = data.filter(d => d.isNew).length;
const mergedCount = data.filter(d => d.isMerged).length;
const genDate = process.env.GEN_DATE || '2026-07-17';

function metricsBlock(d) {
  if (d.isLib) {
    return `<div class="libnote">素材庫精選・尚無近2月投放數據</div>`;
  }
  const rows = d.members.map(m => `
    <tr>
      <td class="ow">${esc(m.label)}</td>
      <td><b>${m.leads ?? '—'}</b></td>
      <td>${m.cpl != null ? '$' + m.cpl : '—'}</td>
      <td>${m.ctr != null ? m.ctr + '%' : '—'}</td>
      <td>${esc(m.consistency ?? '—')}</td>
    </tr>`).join('');
  const multi = d.members.length > 1;
  return `
    <table class="mtable ${multi ? 'multi' : ''}">
      <thead><tr><th>投放主${multi ? ' / 城市' : ''}</th><th>領課</th><th>CPL</th><th>CTR</th><th>領課/活躍天</th></tr></thead>
      <tbody>${rows}</tbody>
      ${multi ? `<tfoot><tr><td>合計</td><td><b>${d.leadsTotal}</b></td><td colspan="3">領課加總（成效分列如上）</td></tr></tfoot>` : ''}
    </table>`;
}

function card(d, rank) {
  const owners = d.owners.map(o => `<span class="pill owner">${esc(o)}</span>`).join('');
  const titles = (d.headlines || []).slice(0, 6).map(t => `<li>${esc(t)}</li>`).join('');
  const bodies = (d.bodies || []).map((b, i) => {
    const tag = d.bodies.length > 1 ? (i === 0 ? '主文案' : `文案${i + 1}`) : '文案';
    return `<div class="copy"><span class="copy-tag">${tag}</span><p>${nl2br(b)}</p></div>`;
  }).join('');
  const badges = [];
  if (d.isNew) badges.push('<span class="tag tnew">🆕 新增創意</span>');
  if (d.isMerged) badges.push('<span class="tag tmerge">🔗 已合併重複視覺</span>');
  const note = d.note ? `<div class="note">ℹ️ ${esc(d.note)}</div>` : '';
  const img = d.image
    ? `<a href="${d.image}" target="_blank" rel="noopener"><img loading="lazy" src="${d.image}" alt="${esc(d.title)}"></a>`
    : `<div class="noimg">無視覺</div>`;
  return `
  <article class="card" data-theme="${esc(d.theme)}">
    <div class="chead">
      <span class="rank">#${rank}</span>
      <div class="ctitle"><h3>${esc(d.title)}</h3>
        <div class="tags">${badges.join('')}</div>
      </div>
    </div>
    <div class="cbody">
      <figure class="visual">${img}<figcaption>投放視覺</figcaption></figure>
      <div class="cdetail">
        <div class="owners">投放主${d.owners.length > 1 ? `（${d.owners.length}）` : ''}：${owners}</div>
        <div class="sec">📊 成效${d.members.length > 1 ? '（分投放主/城市）' : ''}</div>
        ${metricsBlock(d)}
        <div class="sec">✏️ 標題</div>
        <ul class="titles">${titles}</ul>
        <div class="sec">📝 文案</div>
        ${bodies}
        ${note}
      </div>
    </div>
  </article>`;
}

const sections = THEMES.map(t => {
  const items = data.filter(d => d.theme === t.key).sort((a, b) => (b.leadsTotal || 0) - (a.leadsTotal || 0));
  const leads = items.reduce((s, d) => s + (d.leadsTotal || 0), 0);
  const cards = items.map((d, i) => card(d, i + 1)).join('\n');
  return `
  <section class="theme" id="theme-${encodeURIComponent(t.key)}" style="--tc:${t.color}">
    <div class="theme-head">
      <span class="temoji">${t.emoji}</span>
      <div><h2>${t.key}<span class="tcount">${items.length} 組</span></h2><p>${t.desc}　·　小計領課 ${leads.toLocaleString()}</p></div>
    </div>
    <div class="grid">${cards}</div>
  </section>`;
}).join('\n');

const nav = THEMES.map(t =>
  `<a href="#theme-${encodeURIComponent(t.key)}" style="--tc:${t.color}">${t.emoji} ${t.key} <b>${data.filter(d => d.theme === t.key).length}</b></a>`
).join('');

const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,">
<title>最佳閱讀廣告（去重・分主題） ｜ Rose Rose</title>
<style>
  :root{--bg:#f5f7fa;--ink:#1b2430;--muted:#6c7a8c;--line:#e3e9f0;--panel:#fff;
    --shadow:0 12px 34px rgba(24,40,66,.09);}
  *{box-sizing:border-box}html,body{margin:0}
  body{background:var(--bg);color:var(--ink);line-height:1.6;-webkit-text-size-adjust:100%;
    font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif}
  .wrap{max-width:1120px;margin:0 auto;padding:20px 16px 72px}
  header.hero{background:linear-gradient(135deg,#3a7bd5,#2d7467);color:#fff;border-radius:22px;
    padding:28px 24px;box-shadow:var(--shadow)}
  header.hero h1{margin:0 0 8px;font-size:24px;letter-spacing:.4px}
  header.hero p{margin:3px 0;font-size:13.5px;opacity:.95;max-width:840px}
  .kpis{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap}
  .kpi{background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.28);border-radius:14px;
    padding:10px 16px;flex:1;min-width:110px}
  .kpi b{display:block;font-size:22px}.kpi span{font-size:12px;opacity:.9}
  .method{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 18px;
    margin:16px 0;font-size:12.8px;color:var(--muted)}
  .method b{color:var(--ink)}
  nav.themes{position:sticky;top:0;z-index:5;display:flex;gap:8px;flex-wrap:wrap;
    padding:12px 4px;margin:6px 0 4px;background:linear-gradient(var(--bg),var(--bg) 70%,transparent)}
  nav.themes a{text-decoration:none;color:var(--tc);background:var(--panel);border:1.5px solid var(--tc);
    border-radius:999px;padding:6px 14px;font-size:13.5px;font-weight:600}
  nav.themes a b{background:var(--tc);color:#fff;border-radius:8px;padding:0 6px;margin-left:4px;font-size:12px}
  .theme{margin-top:26px}
  .theme-head{display:flex;align-items:center;gap:12px;border-left:5px solid var(--tc);
    padding:2px 0 2px 12px;margin-bottom:14px}
  .temoji{font-size:26px}
  .theme-head h2{margin:0;font-size:19px}
  .tcount{font-size:13px;color:var(--tc);margin-left:8px;font-weight:600}
  .theme-head p{margin:2px 0 0;font-size:12.5px;color:var(--muted)}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);
    overflow:hidden;display:flex;flex-direction:column}
  .chead{display:flex;gap:10px;align-items:flex-start;padding:14px 16px 6px}
  .rank{flex:none;background:var(--tc);color:#fff;font-weight:700;font-size:13px;border-radius:8px;padding:3px 9px;margin-top:2px}
  .ctitle h3{margin:0;font-size:15.5px;line-height:1.35}
  .tags{margin-top:5px;display:flex;gap:5px;flex-wrap:wrap}
  .tag{font-size:10.5px;border-radius:6px;padding:2px 7px;font-weight:600}
  .tnew{background:#e8f6ec;color:#1a8a44;border:1px solid #bfe6cc}
  .tmerge{background:#eef0fb;color:#4655b0;border:1px solid #d4d9f2}
  .cbody{padding:8px 16px 16px}
  .visual{margin:0 0 12px}
  .visual img{width:100%;border-radius:11px;border:1px solid var(--line);display:block;cursor:zoom-in;background:#faf7f2}
  .visual figcaption{font-size:11px;color:var(--muted);margin-top:5px;text-align:center}
  .noimg{aspect-ratio:1;border:1px dashed var(--line);border-radius:11px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:13px}
  .owners{font-size:12.5px;margin-bottom:4px}
  .pill{display:inline-block;border-radius:999px;padding:2px 9px;font-size:11.5px;margin:2px 3px 0 0}
  .pill.owner{background:#eef3f8;color:#3a516e;border:1px solid #dbe6f0}
  .sec{font-size:12.5px;font-weight:700;margin:12px 0 6px}
  .mtable{width:100%;border-collapse:collapse;font-size:12px}
  .mtable th,.mtable td{border:1px solid var(--line);padding:5px 7px;text-align:center}
  .mtable th{background:#f4f7fb;color:var(--muted);font-weight:600;font-size:11px}
  .mtable td.ow{text-align:left;color:#3a516e}
  .mtable td b{color:var(--tc)}
  .mtable tfoot td{background:#fbfcfe;font-weight:600;color:var(--muted);font-size:11px}
  .mtable.multi{box-shadow:0 0 0 2px #eef0fb inset;border-radius:6px}
  .libnote{background:#fff8e6;border:1px solid #f0e2a6;border-radius:8px;padding:7px 10px;font-size:12px;color:#8a6d1a}
  ul.titles{margin:0;padding-left:18px}ul.titles li{font-size:12.8px;margin:2px 0}
  .copy{background:#f7f9fc;border:1px solid var(--line);border-radius:10px;padding:9px 11px;margin:7px 0}
  .copy-tag{display:inline-block;background:var(--tc);color:#fff;font-size:10.5px;border-radius:6px;padding:1px 7px;margin-bottom:5px}
  .copy p{margin:0;font-size:12.5px;color:#333}
  .note{background:#fff8e6;border:1px solid #f0e2a6;border-radius:9px;padding:8px 11px;font-size:11.8px;color:#8a6d1a;margin-top:10px}
  footer{margin-top:34px;text-align:center;color:var(--muted);font-size:12px;line-height:1.9}
  @media(max-width:560px){.grid{grid-template-columns:1fr}header.hero h1{font-size:20px}.mtable{font-size:11px}}
</style>
</head>
<body>
<div class="wrap">
  <header class="hero">
    <h1>📚 最佳閱讀廣告・去重分主題版</h1>
    <p>相同視覺已合併為同一組（標注多個投放主、成效分開紀錄）；補上 ${newCount} 個獨立視覺的好創意。共 ${data.length} 組，依四大主題分類。</p>
    <div class="kpis">
      <div class="kpi"><b>${data.length}</b><span>廣告組（去重後）</span></div>
      <div class="kpi"><b>${mergedCount}</b><span>合併重複視覺</span></div>
      <div class="kpi"><b>${newCount}</b><span>本次新增創意</span></div>
      <div class="kpi"><b>${totalLeads.toLocaleString()}</b><span>近2月合計領課</span></div>
    </div>
  </header>

  <div class="method">
    <b>本次調整：</b>①「相同視覺文案」只算一組，合併後在同一張卡列出<b>多個投放主與各自成效</b>（🔗 標記，共 ${mergedCount} 組，含 108識字卡、我不是壞小孩、我們免費了、我會好好說、復刻識字卡2）。
    ② 因合併與汰換，<b>新增 ${newCount} 個獨立視覺好創意</b>（🆕 標記：情緒學習單、暑假識字練習、注音尋寶卡、暑假注音先修、暑假繪本練習包）。
    ③ 原「ㄈㄊ正音班」為動態素材、平台僅回傳縮圖且素材主題與命名不符（實為識字/共讀），視覺無法正確呈現，<b>已移除</b>。
    <br><b>口徑：</b>績效＝Arkio 投放看板；視覺／文案／投放主＝Meta 廣告素材（素材庫精選者標注無投放數據）。領課以後端 leads_backend 為準，窗口約近 6 週（06-04→07-17）。
  </div>

  <nav class="themes">${nav}</nav>
${sections}

  <footer>
    Rose Rose ｜ 廣告優化 · 最佳閱讀廣告（去重・分主題）<br>
    圖片點擊可放大；🔗 為合併的重複視覺、🆕 為本次新增創意；CPL＝區間花費 ÷ 領課數。<br>
    產出時間：${genDate}
  </footer>
</div>
</body>
</html>`;

fs.writeFileSync(path.join(__dir, 'index.html'), html);
console.log('built index.html |', data.length, 'groups | new', newCount, '| merged', mergedCount);
