// 生成「調漲預算廣告回報」H5（自包含 index.html）。
// 資料源：Arkio creative-library 抓取後儲存的 creatives_raw.json。
// 依附件兩張投放調控回報截圖，只取「調漲（預算調升）」的廣告，重複調漲統一回報。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(fs.readFileSync(path.join(__dir, 'creatives_raw.json'), 'utf8'));
const byId = Object.fromEntries(raw.map(c => [c.id, c]));

const ACCT_ZH = {
  child_wiki: '育兒小百科',
  easylearning_tw: '輕鬆學國英數',
  parent_reading: '親子愛共讀',
  little_pages_club: '繪本福利社',
};

// 5 支去重後的「調漲」廣告；raises 依時間順序列出（來自兩張截圖）
const ADS = [
  {
    no: '25922',
    title: '暑期幼兒英語營（Rose）',
    creativeId: 1030,
    acct: 'child_wiki',
    raises: [
      { from: 9, to: 11, src: '截圖2（單筆・TW01）' },
      { from: 11, to: 14, src: '截圖1（完成6筆）' },
    ],
    note: 'Arkio 素材庫內無「25922」獨立素材；視覺與文案取自同主題複刻版 25974 復刻-暑期幼兒英語營（Rose），投放主 育兒小百科。',
  },
  {
    no: '25954',
    title: 'Codex-暑假識字練習（Rose）小百科',
    creativeId: 948,
    acct: 'child_wiki',
    raises: [
      { from: 26, to: 30, src: '截圖2（完成5筆）' },
      { from: 30, to: 34, src: '截圖1（完成6筆）' },
    ],
  },
  {
    no: '25962',
    title: 'Codex-108識字卡拼圖（Rose）',
    creativeId: 980,
    acct: 'easylearning_tw',
    raises: [
      { from: 8, to: 10, src: '截圖2（完成5筆）' },
      { from: 10, to: 12, src: '截圖1（完成6筆）' },
    ],
  },
  {
    no: '25968',
    title: 'Codex-108識字卡拼圖（Rose）',
    creativeId: 992,
    acct: 'child_wiki',
    raises: [
      { from: 8, to: 10, src: '截圖2（完成5筆）' },
      { from: 10, to: 12, src: '截圖1（完成6筆）' },
    ],
    note: '視覺與 25962 為同一張 108課綱識字卡（不同投放主），依 SOP 共用素材。',
  },
  {
    no: '25969',
    title: '復刻-108識字卡拼圖2（Rose）',
    creativeId: 1020,
    acct: 'parent_reading',
    raises: [
      { from: 5, to: 6, src: '截圖2（完成5筆）' },
      { from: 6, to: 8, src: '截圖1（完成6筆）' },
    ],
  },
];

const data = ADS.map(a => {
  const c = byId[a.creativeId];
  const first = a.raises[0].from, last = a.raises[a.raises.length - 1].to;
  return {
    no: a.no,
    title: a.title,
    acctCode: a.acct,
    acctZh: ACCT_ZH[a.acct] || a.acct,
    image: `assets/${a.creativeId}.png`,
    creativeName: c.name,
    headlines: c.headlines,
    primaryTexts: c.primary_texts,
    raises: a.raises,
    firstBudget: first,
    lastBudget: last,
    totalUp: last - first,
    note: a.note || '',
  };
});

fs.writeFileSync(path.join(__dir, 'data.json'), JSON.stringify(data, null, 2));

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nl2br = s => esc(s).replace(/\n/g, '<br>');

const cards = data.map((d, i) => {
  const raisesHtml = d.raises.map(r =>
    `<span class="raise"><b>$${r.from}</b><span class="arw">→</span><b>$${r.to}</b><em>${esc(r.src)}</em></span>`
  ).join('');
  const heads = d.headlines.map(h => `<li>${esc(h)}</li>`).join('');
  const texts = d.primaryTexts.map((t, j) =>
    `<div class="copy"><span class="copy-tag">${j === 0 ? '長版' : '短版'}</span><p>${nl2br(t)}</p></div>`
  ).join('');
  const noteHtml = d.note ? `<div class="note">⚠️ ${esc(d.note)}</div>` : '';
  return `
    <article class="card" id="ad-${d.no}">
      <div class="card-head">
        <span class="idx">${i + 1}</span>
        <div class="titles">
          <h2>${esc(d.no)}　${esc(d.title)}</h2>
          <div class="meta">
            <span class="pill acct">投放主：${esc(d.acctZh)}<code>${esc(d.acctCode)}</code></span>
            <span class="pill up">預算共 +$${d.totalUp}（$${d.firstBudget}→$${d.lastBudget}）</span>
          </div>
        </div>
      </div>
      <div class="card-body">
        <figure class="visual">
          <a href="${d.image}" target="_blank" rel="noopener"><img loading="lazy" src="${d.image}" alt="${esc(d.title)} 視覺"></a>
          <figcaption>視覺｜${esc(d.creativeName)}</figcaption>
        </figure>
        <div class="detail">
          <div class="raises">
            <div class="sec-label">📈 調漲紀錄</div>
            ${raisesHtml}
          </div>
          <div class="sec-label">✏️ 標題（Headlines）</div>
          <ul class="heads">${heads}</ul>
          <div class="sec-label">📝 文案（Primary Texts）</div>
          ${texts}
          ${noteHtml}
        </div>
      </div>
    </article>`;
}).join('\n');

const genDate = process.env.GEN_DATE || '2026-07-17';

const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,">
<title>調漲預算廣告回報 ｜ Rose Rose</title>
<style>
  :root{
    --bg:#f6f8fb; --ink:#1c2530; --muted:#6b7889; --line:#e2e8f1;
    --panel:#ffffff; --up:#e8562a; --up-soft:#fdeee7; --acct:#2d7467;
    --shadow:0 14px 40px rgba(28,45,72,.10);
  }
  *{box-sizing:border-box}
  html,body{margin:0}
  body{background:var(--bg);color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif;
    line-height:1.65;-webkit-text-size-adjust:100%}
  .wrap{max-width:860px;margin:0 auto;padding:20px 16px 64px}
  header.hero{background:linear-gradient(135deg,#ff8a5b,#e8562a);color:#fff;border-radius:20px;
    padding:26px 22px;box-shadow:var(--shadow)}
  header.hero h1{margin:0 0 6px;font-size:23px;letter-spacing:.5px}
  header.hero p{margin:2px 0;font-size:13.5px;opacity:.95}
  .kpis{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}
  .kpi{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);border-radius:14px;
    padding:10px 14px;flex:1;min-width:110px}
  .kpi b{display:block;font-size:22px;line-height:1.2}
  .kpi span{font-size:12px;opacity:.9}
  .excluded{background:var(--panel);border:1px solid var(--line);border-radius:14px;
    padding:12px 16px;margin:18px 0 6px;font-size:13px;color:var(--muted)}
  .excluded b{color:var(--ink)}
  .excluded s{color:#b0392a}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:18px;
    box-shadow:var(--shadow);margin-top:18px;overflow:hidden}
  .card-head{display:flex;gap:12px;align-items:flex-start;padding:16px 18px 4px}
  .idx{flex:none;width:30px;height:30px;border-radius:50%;background:var(--up);color:#fff;
    font-weight:700;display:flex;align-items:center;justify-content:center;font-size:15px;margin-top:2px}
  .titles h2{margin:0;font-size:17px;line-height:1.4}
  .meta{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 0}
  .pill{font-size:12.5px;border-radius:999px;padding:4px 11px;display:inline-flex;align-items:center;gap:6px}
  .pill.acct{background:#e7f2ef;color:var(--acct)}
  .pill.acct code{background:#d4e8e2;padding:1px 6px;border-radius:6px;font-size:11px}
  .pill.up{background:var(--up-soft);color:var(--up);font-weight:600}
  .card-body{display:flex;gap:18px;padding:12px 18px 20px;flex-wrap:wrap}
  .visual{margin:0;flex:0 0 240px;max-width:240px}
  .visual img{width:100%;border-radius:12px;border:1px solid var(--line);display:block;cursor:zoom-in}
  .visual figcaption{font-size:11.5px;color:var(--muted);margin-top:6px;text-align:center}
  .detail{flex:1;min-width:240px}
  .sec-label{font-size:13px;font-weight:700;color:var(--ink);margin:14px 0 7px}
  .sec-label:first-child{margin-top:0}
  .raises{display:flex;flex-direction:column;gap:6px;margin-bottom:4px}
  .raise{display:inline-flex;align-items:center;gap:8px;background:var(--up-soft);
    border-radius:10px;padding:6px 12px;font-size:14px;color:var(--up);align-self:flex-start}
  .raise .arw{opacity:.7}
  .raise b{font-size:15px}
  .raise em{font-style:normal;color:var(--muted);font-size:11.5px;margin-left:4px}
  ul.heads{margin:0;padding-left:20px}
  ul.heads li{font-size:14px;margin:3px 0}
  .copy{background:#f7f9fc;border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:8px 0}
  .copy-tag{display:inline-block;background:var(--acct);color:#fff;font-size:11px;
    border-radius:6px;padding:1px 8px;margin-bottom:6px}
  .copy p{margin:0;font-size:13.5px;color:#333}
  .note{background:#fff8e6;border:1px solid #f2e2a8;border-radius:10px;padding:9px 12px;
    font-size:12.5px;color:#8a6d1a;margin-top:12px}
  footer{margin-top:26px;text-align:center;color:var(--muted);font-size:12px;line-height:1.8}
  footer a{color:var(--acct)}
  @media(max-width:560px){
    .visual{flex:0 0 100%;max-width:100%}
    header.hero h1{font-size:20px}
  }
</style>
</head>
<body>
<div class="wrap">
  <header class="hero">
    <h1>📈 調漲預算廣告回報</h1>
    <p>來源：投放調控執行回報（Nova）兩張截圖・${genDate}</p>
    <p>口徑：僅列「預算調升」廣告，已排除調降；重複調漲已統一為一支。素材取自 Arkio 素材庫。</p>
    <div class="kpis">
      <div class="kpi"><b>5</b><span>調漲廣告（去重後）</span></div>
      <div class="kpi"><b>9</b><span>調漲次數合計</span></div>
      <div class="kpi"><b>2</b><span>已排除的調降</span></div>
    </div>
  </header>

  <div class="excluded">
    <b>已排除（調降，不在本次回報）：</b>
    25342 醜圖-我不是壞小孩-高雄市 <s>$15→$10</s>、
    25831 醜圖-5日共讀徵集-台北市 <s>$11→$8</s>
  </div>

${cards}

  <footer>
    Rose Rose ｜ 廣告優化 · 調漲預算回報 H5<br>
    圖片點擊可放大；投放主 code 對應 Arkio social account。<br>
    產出時間：${genDate}
  </footer>
</div>
</body>
</html>`;

fs.writeFileSync(path.join(__dir, 'index.html'), html);
console.log('built index.html +', data.length, 'ads, images from assets/');
