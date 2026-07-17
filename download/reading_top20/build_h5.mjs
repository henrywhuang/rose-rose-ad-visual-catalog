// 生成「近2个月・最佳阅读广告 Top 20」H5（自包含 index.html）。
// 数据：reading_top20_data.json（同目录上一层）。按 情緒/識字/正音表達/其他 四类分区。
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

const THUMB_ONLY = new Set(['25884']); // 动态素材，Meta 仅回传缩图

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nl2br = s => esc(s).replace(/\n/g, '<br>');

const totalLeads = data.reduce((s, d) => s + d.leads, 0);
const genDate = process.env.GEN_DATE || '2026-07-17';

function card(d, rank) {
  const owners = d.owners.map(o => `<span class="pill owner">${esc(o)}</span>`).join('');
  const titles = (d.titles || []).slice(0, 6).map(t => `<li>${esc(t)}</li>`).join('');
  const bodies = (d.bodies || []).map((b, i) => {
    const tag = d.bodies.length > 1 ? (i === 0 ? '主文案' : `文案${i + 1}`) : '文案';
    return `<div class="copy"><span class="copy-tag">${tag}</span><p>${nl2br(b)}</p></div>`;
  }).join('');
  const thumb = THUMB_ONLY.has(d.no);
  const noteBits = [];
  if (d.note) noteBits.push(esc(d.note));
  if (thumb) noteBits.push('此為動態素材（Meta dynamic creative），平台僅回傳縮圖，視覺以實際投放為準。');
  const note = noteBits.length ? `<div class="note">ℹ️ ${noteBits.join('　/　')}</div>` : '';
  const img = d.image
    ? `<a href="${d.image}" target="_blank" rel="noopener"><img class="${thumb ? 'thumb' : ''}" loading="lazy" src="${d.image}" alt="${esc(d.title)}"></a>`
    : `<div class="noimg">無視覺</div>`;
  const cplTxt = d.cpl != null ? `$${d.cpl}` : '—';
  return `
  <article class="card" data-theme="${esc(d.theme)}">
    <div class="chead">
      <span class="rank">#${rank}</span>
      <div class="ctitle"><h3>${esc(d.title)}</h3><div class="cno">編號 ${esc(d.no)}</div></div>
    </div>
    <div class="cbody">
      <figure class="visual">${img}<figcaption>${thumb ? '縮圖' : '投放視覺'}</figcaption></figure>
      <div class="cdetail">
        <div class="metrics">
          <div class="m"><b>${d.leads}</b><span>近2月領課</span></div>
          <div class="m"><b>${cplTxt}</b><span>領課成本</span></div>
          <div class="m"><b>${d.ctr}%</b><span>近7日CTR</span></div>
          <div class="m"><b>${esc(d.consistency)}</b><span>領課/活躍天</span></div>
        </div>
        <div class="owners">投放主：${owners}</div>
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
  const items = data.filter(d => d.theme === t.key).sort((a, b) => b.leads - a.leads);
  const leads = items.reduce((s, d) => s + d.leads, 0);
  const cards = items.map((d, i) => card(d, i + 1)).join('\n');
  return `
  <section class="theme" id="theme-${encodeURIComponent(t.key)}" style="--tc:${t.color}">
    <div class="theme-head">
      <span class="temoji">${t.emoji}</span>
      <div><h2>${t.key}<span class="tcount">${items.length} 支</span></h2><p>${t.desc}　·　小計領課 ${leads}</p></div>
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
<title>近2個月・最佳閱讀廣告 Top 20 ｜ Rose Rose</title>
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
  header.hero p{margin:3px 0;font-size:13.5px;opacity:.95;max-width:820px}
  .kpis{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap}
  .kpi{background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.28);border-radius:14px;
    padding:10px 16px;flex:1;min-width:120px}
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
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);
    overflow:hidden;display:flex;flex-direction:column}
  .chead{display:flex;gap:10px;align-items:center;padding:14px 16px 6px}
  .rank{flex:none;background:var(--tc);color:#fff;font-weight:700;font-size:13px;border-radius:8px;padding:3px 9px}
  .ctitle h3{margin:0;font-size:15.5px;line-height:1.35}
  .cno{font-size:11.5px;color:var(--muted);margin-top:2px}
  .cbody{padding:8px 16px 16px}
  .visual{margin:0 0 12px}
  .visual img{width:100%;border-radius:11px;border:1px solid var(--line);display:block;cursor:zoom-in;background:#faf7f2}
  .visual img.thumb{image-rendering:auto;filter:saturate(1.05)}
  .visual figcaption{font-size:11px;color:var(--muted);margin-top:5px;text-align:center}
  .noimg{aspect-ratio:1;border:1px dashed var(--line);border-radius:11px;display:flex;align-items:center;
    justify-content:center;color:var(--muted);font-size:13px}
  .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px}
  .metrics .m{background:#f6f9fc;border:1px solid var(--line);border-radius:9px;padding:7px 4px;text-align:center}
  .metrics .m b{display:block;font-size:15px;color:var(--tc)}
  .metrics .m span{font-size:10px;color:var(--muted)}
  .owners{font-size:12.5px;margin-bottom:8px}
  .pill{display:inline-block;border-radius:999px;padding:2px 9px;font-size:11.5px;margin:2px 3px 0 0}
  .pill.owner{background:#eef3f8;color:#3a516e;border:1px solid #dbe6f0}
  .sec{font-size:12.5px;font-weight:700;margin:12px 0 6px}
  ul.titles{margin:0;padding-left:18px}ul.titles li{font-size:12.8px;margin:2px 0}
  .copy{background:#f7f9fc;border:1px solid var(--line);border-radius:10px;padding:9px 11px;margin:7px 0}
  .copy-tag{display:inline-block;background:var(--tc);color:#fff;font-size:10.5px;border-radius:6px;padding:1px 7px;margin-bottom:5px}
  .copy p{margin:0;font-size:12.5px;color:#333;white-space:normal}
  .note{background:#fff8e6;border:1px solid #f0e2a6;border-radius:9px;padding:8px 11px;font-size:11.8px;color:#8a6d1a;margin-top:10px}
  footer{margin-top:34px;text-align:center;color:var(--muted);font-size:12px;line-height:1.9}
  @media(max-width:560px){.grid{grid-template-columns:1fr}header.hero h1{font-size:20px}}
</style>
</head>
<body>
<div class="wrap">
  <header class="hero">
    <h1>📚 近2個月・最佳閱讀廣告 Top 20</h1>
    <p>從 30 支在投閱讀廣告中，篩出近 2 個月<b style="color:#fff">持續有在領課</b>、且成本低 / CTR 高的前 20 支，含視覺、文案、投放主，依四大主題分類。</p>
    <div class="kpis">
      <div class="kpi"><b>20</b><span>精選廣告</span></div>
      <div class="kpi"><b>4</b><span>主題分類</span></div>
      <div class="kpi"><b>${totalLeads.toLocaleString()}</b><span>近2月合計領課</span></div>
      <div class="kpi"><b>06/04–07/17</b><span>觀察窗口</span></div>
    </div>
  </header>

  <div class="method">
    <b>口徑說明：</b>資料源＝Arkio 投放看板（績效，即時）＋ Meta 廣告素材（視覺／文案／投放主）。
    範圍限 <b>Reading（閱讀）</b>業務線；領課以後端回傳 <b>leads_backend</b> 為準，後端回傳不準者回退 Meta 口徑。
    排序主指標＝<b>近2月累計領課量</b>，並參考「持續領課天數 / 領課成本 CPL / 近7日 CTR」。
    相同視覺跨多個投放帳號者已<b>統一為一支</b>並合併領課、列出全部投放主。窗口由兩份看板快照（07-02、07-17）合併而成，約 6 週。
  </div>

  <nav class="themes">${nav}</nav>
${sections}

  <footer>
    Rose Rose ｜ 廣告優化 · 最佳閱讀廣告 Top 20（依主題分類）<br>
    圖片點擊可放大；領課成本 CPL＝區間花費 ÷ 領課數。<br>
    產出時間：${genDate}
  </footer>
</div>
</body>
</html>`;

fs.writeFileSync(path.join(__dir, 'index.html'), html);
console.log('built index.html |', data.length, 'ads |', THEMES.map(t => `${t.key}:${data.filter(d => d.theme === t.key).length}`).join(' '));
