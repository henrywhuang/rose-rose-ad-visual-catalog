// 動態流量池監控台生成器（自包含，Node18+ 內建 fetch，無需 npm 依賴）。
// 由 GitHub Actions 於每週三、週五 09:00(台北) 自動執行，或本機 node marketing/build.mjs。
// 需環境變數 LARK_APP_ID / LARK_APP_SECRET（本機可放 ../.lark_app）。
// 產出：marketing/index.html（動態看板）與 marketing/data.json（原始運算結果）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dir;

// ---- creds（優先環境變數，其次本機 ../.lark_app）----
if (!process.env.LARK_APP_ID) {
  const cf = path.resolve(__dir, '..', '..', '.lark_app');
  if (fs.existsSync(cf)) for (const l of fs.readFileSync(cf, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Za-z_]+)\s*=\s*(.+?)\s*$/); if (m) process.env[m[1].toUpperCase()] ??= m[2]; }
}
const APP_ID = process.env.LARK_APP_ID, APP_SECRET = process.env.LARK_APP_SECRET;
if (!APP_ID || !APP_SECRET) { console.error('缺 LARK_APP_ID / LARK_APP_SECRET'); process.exit(1); }
const BASE = 'https://open.larksuite.com/open-apis';
const APP = 'basusvQmREyWA52Egg9UdF0JZIe';
const CFG_TABLE = 'tblJ2USmoL6hL8uA', RD_TABLE = 'tbl7BVA7sBJRfUj5', EN_TABLE = 'tblgNYfP4gyrTqDq';

const DAY = 86400000, TZ = 8 * 3600000; // 台北 UTC+8（無夏令）
const now = Date.now();
const tpDayKey = ts => new Date(ts + TZ).toISOString().slice(0, 10);
const tpNow = new Date(now + TZ);
const WD = ['日', '一', '二', '三', '四', '五', '六'];
const checkpointWd = WD[tpNow.getUTCDay()];
const genStamp = new Date(now + TZ).toISOString().slice(0, 16).replace('T', ' ');

const tj = await (await fetch(`${BASE}/auth/v3/tenant_access_token/internal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }) })).json();
if (tj.code !== 0) throw new Error('token ' + JSON.stringify(tj));
const G = { Authorization: `Bearer ${tj.tenant_access_token}` };

const cfgFields = (await (await fetch(`${BASE}/bitable/v1/apps/${APP}/tables/${CFG_TABLE}/fields?page_size=200`, { headers: G })).json()).data.items;
const catMap = {}, subMap = {};
for (const f of cfgFields) { if (f.field_name === '渠道分類') for (const o of f.property.options) catMap[o.id] = o.name; if (f.field_name === '子類') for (const o of f.property.options) subMap[o.id] = o.name; }

async function pull(tid) { let it = [], pt = ''; do { const u = new URL(`${BASE}/bitable/v1/apps/${APP}/tables/${tid}/records`); u.searchParams.set('page_size', '500'); if (pt) u.searchParams.set('page_token', pt); const j = await (await fetch(u, { headers: G })).json(); if (j.code !== 0) throw new Error('records ' + JSON.stringify(j).slice(0, 200)); it = it.concat(j.data.items || []); pt = j.data.has_more ? j.data.page_token : ''; } while (pt); return it; }
const one = v => Array.isArray(v) ? v[0] : v;
const txt = v => v == null ? '' : Array.isArray(v) ? v.map(txt).join('') : (typeof v === 'object' ? (v.text ?? v.name ?? '') : String(v));
const pnum = p => { const n = parseInt(String(p).replace(/[^0-9]/g, '')); return isNaN(n) ? null : n; };
const toRecs = raw => raw.map(r => ({ period: pnum(txt(r.fields['期別'])), cat: catMap[one(r.fields['渠道分類'])] || '', sub: subMap[one(r.fields['渠道子類'])] || '', ts: one(r.fields['領取時間']) || null }));

const rd = toRecs(await pull(RD_TABLE));
const en = toRecs(await pull(EN_TABLE));

// ---- 統計工具 ----
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
const R = v => Math.round(v * 10) / 10, R0 = v => Math.round(v);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#0ea5e9', '#14b8a6', '#ec4899', '#84cc16', '#f97316', '#64748b', '#eab308', '#06b6d4', '#d946ef'];

// 各期均為週末（六/日）開跑、7天一輪。偵測到的起跑日回貼到最近的週末，
// 消除「爬升型」科目（如英語 day1 量小）造成的 ±1 天誤判。
const snapWeekend = ms => { let d = ms; for (let i = 0; i < 6; i++) { const wd = new Date(d + TZ).getUTCDay(); if (wd === 0 || wd === 6) return d; d -= DAY; } return ms; };
// 每期起跑日（科目層級偵測，避免拆池後零星早領誤判）：回傳 {期別: 台北零點UTC ms}
function computeStarts(subjectRecs) {
  const byPer = {};
  for (const r of subjectRecs) { if (r.period == null || !r.ts) continue; (byPer[r.period] ??= []).push(r.ts); }
  const starts = {};
  for (const [per, ts] of Object.entries(byPer)) {
    ts.sort((a, b) => a - b);
    const dc = {}; for (const x of ts) { const d = tpDayKey(x); dc[d] = (dc[d] || 0) + 1; }
    const days = Object.entries(dc).sort((a, b) => a[0] < b[0] ? -1 : 1);
    const launch = days.find(([d, c]) => c >= 5) || days[0];
    if (launch) starts[per] = snapWeekend(new Date(launch[0] + 'T00:00:00Z').getTime() - TZ);
  }
  return starts;
}
// 期內累積比例曲線：回傳 g[1..7]=第k天累積占全期比例（起跑日用科目層級 starts）
function pacingCurve(poolRecs, periods, starts) {
  const rows = [];
  for (const per of periods) {
    const start = starts[per]; if (start == null) continue;
    const ts = poolRecs.filter(r => r.period === per && r.ts).map(r => r.ts).sort((a, b) => a - b);
    const total = ts.filter(x => x >= start).length; if (total < 15) continue;
    const frac = []; for (let k = 1; k <= 7; k++) { const cut = start + k * DAY; frac.push(ts.filter(x => x >= start && x < cut).length / total); }
    rows.push(frac);
  }
  const g = []; for (let k = 0; k < 7; k++) g.push(rows.length ? mean(rows.map(r => r[k])) : (k + 1) / 7);
  return g;
}
const interpCurve = (g, d) => { if (d <= 0) return 0; if (d >= 7) return Math.max(g[6], 0.999); const i = Math.floor(d), f = d - i; const a = i === 0 ? 0 : g[i - 1], b = g[i]; return a + (b - a) * f; };

function analyzePool(name, key, subjectRecs, cats, baseN = 12) {
  const data = subjectRecs;
  const starts = computeStarts(subjectRecs);
  const inPool = data.filter(r => r.period != null && (!cats || cats.has(r.cat)));
  const allPeriods = [...new Set(inPool.map(r => r.period))].sort((a, b) => a - b);
  const current = allPeriods[allPeriods.length - 1];
  const completed = allPeriods.filter(p => p < current);
  const basePeriods = completed.slice(-baseN);

  // 各渠道基準：平均、σ、逐期序列
  const subs = [...new Set(inPool.filter(r => basePeriods.includes(r.period)).map(r => r.sub || '(未分類)'))];
  const chan = subs.map(s => {
    const series = basePeriods.map(p => inPool.filter(r => r.period === p && (r.sub || '(未分類)') === s).length);
    return { name: s, series, mean: mean(series), sd: sd(series), sum: series.reduce((x, y) => x + y, 0) };
  }).sort((a, b) => b.mean - a.mean).filter(x => x.mean >= 0.3);

  const totSeries = basePeriods.map(p => inPool.filter(r => r.period === p).length);
  const poolMean = mean(totSeries), poolSd = sd(totSeries);

  // 期內曲線與當期進度
  const g = pacingCurve(inPool, basePeriods, starts);
  const start = starts[current] ?? (now - 3 * DAY);
  const elapsed = clamp((now - start) / DAY, 0, 7);
  const expFrac = interpCurve(g, elapsed);
  const curCount = s => inPool.filter(r => r.period === current && (r.sub || '(未分類)') === s).length;

  const remainDays = Math.max(0.5, 7 - elapsed);
  const channels = chan.map((c, i) => {
    const target = c.mean, actual = curCount(c.name);
    const expNow = target * expFrac;
    const ratio = expNow > 0.3 ? actual / expNow : (actual > 0 ? 1.5 : 1);
    const projected = expFrac > 0.02 ? actual / expFrac : actual;
    const gap = Math.max(0, target - projected);
    const retired = c.series.slice(-3).every(v => v === 0) && c.series.some(v => v > 0); // 近3期歸零＝退場
    const small = target < 3; // 量太小（<3/期）不做進度預警，只列出
    let status = 'ok';
    if (retired) status = 'retired';
    else if (small) status = 'small';
    else if (ratio >= 1.15) status = 'ahead';
    else if (ratio >= 0.9) status = 'ok';
    else if (ratio >= 0.7) status = 'watch';
    else status = 'behind';
    return { name: c.name, color: PALETTE[i % PALETTE.length], target: R(target), actual,
      expNow: R(expNow), ratio: R(ratio * 100), projected: R0(projected), gap: R0(gap),
      perDay: R(gap / remainDays), status, series: c.series };
  });

  const totTarget = poolMean, totActual = inPool.filter(r => r.period === current).length;
  const totExp = totTarget * expFrac, totProj = expFrac > 0.02 ? totActual / expFrac : totActual;
  const totRatio = totExp > 0 ? totActual / totExp : 1;
  const behind = channels.filter(c => c.status === 'behind');
  const watch = channels.filter(c => c.status === 'watch');
  const ahead = channels.filter(c => c.status === 'ahead');

  return {
    key, name, current, basePeriods, elapsed: R(elapsed), expFrac: R(expFrac * 100),
    curve: g.map(v => R0(v * 100)),
    pool: { target: R(totTarget), sd: R(poolSd), actual: totActual, expNow: R(totExp), ratio: R(totRatio * 100),
      projected: R0(totProj), gap: R0(Math.max(0, totTarget - totProj)),
      lo: R0(poolMean - poolSd), hi: R0(poolMean + poolSd) },
    channels,
    diag: { behind: behind.map(c => c.name), watch: watch.map(c => c.name), ahead: ahead.map(c => c.name) },
  };
}

const POOLS = [
  analyzePool('閱讀｜自有流量池', 'read', rd, new Set(['公域流量', '私域流量'])),
  analyzePool('英語｜公領域', 'en_pub', en, new Set(['公域流量'])),
  analyzePool('英語｜私領域', 'en_pri', en, new Set(['私域流量'])),
];

const payload = { genStamp, checkpointWd, tpDate: tpNow.toISOString().slice(0, 10), pools: POOLS };
fs.writeFileSync(path.join(OUT, 'data.json'), JSON.stringify(payload, null, 1));

// ================= HTML =================
const html = `<!doctype html>
<html lang="zh-Hant"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>流量池監控台｜閱讀・英語</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
:root{--bg:#0b1020;--card:#151b2e;--card2:#1b2338;--line:#2a3450;--txt:#e8ecf6;--sub:#96a0bd;--good:#22c55e;--warn:#ef4444;--watch:#f59e0b;--ahead:#38bdf8;--boom:#facc15;--accent:#6366f1}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;background:linear-gradient(180deg,#0b1020,#0e1428);color:var(--txt);font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif;line-height:1.6;padding-bottom:60px}
.wrap{max-width:900px;margin:0 auto;padding:16px 13px}
h1{font-size:19px;margin:0 0 3px}
.meta{color:var(--sub);font-size:12px}
.ck{background:linear-gradient(135deg,#1e2745,#151b2e);border:1px solid var(--line);border-radius:14px;padding:13px 14px;margin:13px 0}
.ck .big{font-size:15px;font-weight:700}
.ck .s{color:var(--sub);font-size:12.5px;margin-top:4px}
.note{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 13px;font-size:12px;color:var(--sub);margin:12px 0}
.note b{color:var(--txt)}
nav.tabs{position:sticky;top:0;z-index:9;display:flex;gap:8px;padding:9px 0;background:#0b1020ee;backdrop-filter:blur(6px);overflow-x:auto}
nav.tabs button{flex:0 0 auto;border:1px solid var(--line);background:var(--card);color:var(--sub);border-radius:999px;padding:7px 14px;font-size:13px;font-weight:600;position:relative}
nav.tabs button.on{background:var(--accent);color:#fff;border-color:var(--accent)}
nav.tabs button .badge{position:absolute;top:-5px;right:-5px;background:var(--warn);color:#fff;font-size:10px;min-width:16px;height:16px;line-height:16px;border-radius:8px;padding:0 3px}
section.pool{display:none}section.pool.on{display:block}
h2{font-size:16px;margin:14px 0 2px}
.span{color:var(--sub);font-size:11.5px;margin-bottom:10px}
.summary{border-radius:14px;padding:13px 14px;margin:10px 0;font-size:13.5px;border:1px solid}
.summary.green{background:#0f2417;border-color:#1e5b39}
.summary.red{background:#2a1416;border-color:#7f1d1d}
.summary .hd{font-weight:800;font-size:14.5px;margin-bottom:5px}
.summary ul{margin:6px 0 0;padding-left:18px}
.summary li{margin:2px 0}
.gauge{display:flex;gap:9px;margin:11px 0}
.gcard{flex:1;background:var(--card);border:1px solid var(--line);border-radius:13px;padding:11px}
.gcard .k{font-size:11px;color:var(--sub)}
.gcard .v{font-size:20px;font-weight:800;margin-top:1px}
.gcard .u{font-size:11px;color:var(--sub);font-weight:500}
.bar{height:7px;border-radius:4px;background:#25304d;overflow:hidden;margin-top:7px}
.bar > i{display:block;height:100%;border-radius:4px}
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:13px;margin:11px 0;-webkit-overflow-scrolling:touch}
table{border-collapse:collapse;width:100%;font-size:12.5px;white-space:nowrap}
th,td{padding:8px 9px;text-align:right;border-bottom:1px solid var(--line)}
th:first-child,td:first-child{text-align:left;position:sticky;left:0;background:var(--card);z-index:1}
thead th{background:var(--card2);color:var(--sub);position:sticky;top:0}
.st{font-weight:700;font-size:11px;padding:2px 7px;border-radius:999px;display:inline-block}
.st.behind{background:#3a1518;color:#fca5a5}.st.watch{background:#3a2c12;color:#fcd34d}
.st.ok{background:#123322;color:#86efac}.st.ahead{background:#0e2c3d;color:#7dd3fc}.st.small,.st.retired{background:#20263a;color:#96a0bd}
.chan-name{display:flex;align-items:center;gap:6px}
.dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto}
.sug{color:var(--sub);font-size:11.5px}
details{margin:9px 0}summary{cursor:pointer;color:var(--sub);font-size:13px;padding:6px 2px}
.chartbox{background:var(--card);border:1px solid var(--line);border-radius:13px;padding:12px 8px 8px;margin:11px 0}
.chartbox h3{margin:2px 8px 8px;font-size:13px;color:var(--sub)}
.foot{color:var(--sub);font-size:11px;text-align:center;margin-top:24px;line-height:1.8}
td.excl{color:var(--sub);font-style:italic}
</style></head><body><div class="wrap">
<h1>流量池監控台 · 閱讀 / 英語</h1>
<div class="meta">當期渠道進量 · 按歷史節奏比例預警 · 自動更新每週三・五 09:00（台北）</div>
<div class="ck" id="ck"></div>
<div class="note">
判讀邏輯：以近12期完整期的<b>平均值</b>為當期目標，並用歷史<b>期內累積曲線</b>推估「到今天應該累積多少」（非直線 2/7、4/7，而是實際節奏）。
當期實際 ÷ 應達 = 進度%。<span style="color:var(--good)">≥90% 正常</span>、<span style="color:var(--watch)">70–90% 略慢(留意)</span>、<span style="color:var(--warn)">&lt;70% 落後(警訊)</span>、<span style="color:var(--ahead)">≥115% 超前</span>。
「推估期末」＝實際 ÷ 已達比例；不足平均即為<b>缺口</b>（該補的量）。量太小的渠道只列不預警。
</div>
<nav class="tabs" id="tabs"></nav>
<div id="pools"></div>
<div class="foot">Rose Rose 行銷部 · 自有流量池即時監控<br>資料源 Lark Base 體驗營追蹤表 · 最後更新 <span id="ls"></span></div>
</div>
<script>
const DATA = ${JSON.stringify(payload)};
document.getElementById('ls').textContent = DATA.genStamp + '（台北）';
document.getElementById('ck').innerHTML =
  '<div class="big">📍 本次檢查點：' + DATA.tpDate + '（週' + DATA.checkpointWd + '）09:00</div>' +
  '<div class="s">' + DATA.pools.map(p => p.name + '：' + p.current + '期・第' + p.elapsed + '天（歷史約 ' + p.expFrac + '%）').join('　｜　') + '</div>';
const tabs = document.getElementById('tabs'), poolsEl = document.getElementById('pools');
const stName = { behind:'🔴 落後', watch:'🟡 略慢', ok:'🟢 正常', ahead:'🔥 超前', small:'· 量小', retired:'· 退場' };

DATA.pools.forEach((p, idx) => {
  const nBad = p.channels.filter(c=>c.status==='behind').length;
  const btn = document.createElement('button');
  btn.innerHTML = p.name + (nBad?'<span class="badge">'+nBad+'</span>':'');
  btn.className = idx===0?'on':'';
  btn.onclick = () => { document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.remove('on')); document.querySelectorAll('section.pool').forEach(s=>s.classList.remove('on')); btn.classList.add('on'); document.getElementById('sec-'+p.key).classList.add('on'); };
  tabs.appendChild(btn);

  const sec = document.createElement('section');
  sec.className = 'pool'+(idx===0?' on':''); sec.id = 'sec-'+p.key;
  const pl = p.pool;
  const poolOk = pl.projected >= pl.target*0.98;
  // 摘要
  let sum = '<div class="summary '+(poolOk?'green':'red')+'">';
  sum += '<div class="hd">'+(poolOk?'✅ 整體進度達標':'⚠️ 整體低於均值，需補量')+'（推估期末 '+pl.projected+' vs 均 '+pl.target+'）</div>';
  if (p.diag.behind.length) sum += '🔴 落後需加推：<b>'+p.diag.behind.join('、')+'</b>';
  else sum += '目前無明顯落後渠道';
  sum += '<ul>';
  p.channels.filter(c=>c.status==='behind').forEach(c=>{ sum += '<li><b>'+c.name+'</b>：進度僅 '+c.ratio+'%，推估期末 '+c.projected+'（均 '+c.target+'），本期約缺 <b>'+c.gap+'</b> 人，建議每日加推 ~'+c.perDay+' 人</li>'; });
  if (p.diag.watch.length) sum += '<li>🟡 留意：'+p.diag.watch.join('、')+'（略慢，先觀察）</li>';
  if (p.diag.ahead.length) sum += '<li>🔥 超前可調配：'+p.diag.ahead.join('、')+'（可勻預算/人力去補落後渠道）</li>';
  if (!poolOk) sum += '<li>整體本期預估缺口約 <b>'+pl.gap+'</b> 人，需跨渠道補量或整體加推</li>';
  sum += '</ul></div>';

  const pct = Math.min(100, pl.ratio);
  const col = pl.ratio>=90?'var(--good)':pl.ratio>=70?'var(--watch)':'var(--warn)';
  sec.innerHTML =
    '<h2>'+p.name+'</h2>'+
    '<div class="span">當期 '+p.current+'期 · 已跑 '+p.elapsed+' 天（歷史同期約 '+p.expFrac+'%）· 基準 '+p.basePeriods[0]+'–'+p.basePeriods[p.basePeriods.length-1]+'期</div>'+
    sum+
    '<div class="gauge">'+
      '<div class="gcard"><div class="k">當期實際</div><div class="v">'+pl.actual+' <span class="u">人</span></div></div>'+
      '<div class="gcard"><div class="k">此刻應達</div><div class="v">'+pl.expNow+' <span class="u">人</span></div></div>'+
      '<div class="gcard"><div class="k">進度</div><div class="v" style="color:'+col+'">'+pl.ratio+'<span class="u">%</span></div><div class="bar"><i style="width:'+pct+'%;background:'+col+'"></i></div></div>'+
    '</div>'+
    buildChanTable(p)+
    '<div class="chartbox"><h3>基準期各渠道逐期進量（近'+p.basePeriods.length+'期）</h3><canvas id="c-'+p.key+'" height="210"></canvas></div>';
  poolsEl.appendChild(sec);
});

function buildChanTable(p){
  let h='<div class="tablewrap"><table><thead><tr><th>渠道</th><th>均值目標</th><th>應達</th><th>實際</th><th>進度</th><th>狀態</th><th>推估期末</th><th>缺口</th><th>建議</th></tr></thead><tbody>';
  const ord={behind:0,watch:1,ok:2,ahead:3,small:4,retired:5};
  [...p.channels].sort((a,b)=>ord[a.status]-ord[b.status]||b.target-a.target).forEach(c=>{
    const noWarn = c.status==='small'||c.status==='retired';
    let sug = c.status==='behind'?('加推 ~'+c.perDay+'/日'):c.status==='watch'?'觀察':c.status==='ahead'?'可調配':'—';
    h+='<tr><td><span class="chan-name"><span class="dot" style="background:'+c.color+'"></span>'+c.name+'</span></td>'+
      '<td>'+c.target+'</td><td>'+c.expNow+'</td><td><b>'+c.actual+'</b></td>'+
      '<td>'+(noWarn?'—':c.ratio+'%')+'</td><td><span class="st '+c.status+'">'+stName[c.status]+'</span></td>'+
      '<td>'+c.projected+'</td><td'+(c.gap>0&&!noWarn?' style="color:var(--warn);font-weight:700"':'')+'>'+(noWarn?'—':c.gap)+'</td>'+
      '<td class="sug">'+sug+'</td></tr>';
  });
  h+='</tbody></table></div>';
  return h;
}
DATA.pools.forEach(p=>{
  new Chart(document.getElementById('c-'+p.key),{type:'bar',
    data:{labels:p.basePeriods,datasets:p.channels.map(c=>({label:c.name,data:c.series,backgroundColor:c.color,borderWidth:0,stack:'s'}))},
    options:{responsive:true,maintainAspectRatio:true,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:'#96a0bd',font:{size:10},boxWidth:10,padding:6}},tooltip:{callbacks:{footer:it=>'合計 '+it.reduce((a,b)=>a+b.parsed.y,0)}}},
      scales:{x:{stacked:true,ticks:{color:'#96a0bd',font:{size:9}},grid:{display:false}},y:{stacked:true,ticks:{color:'#96a0bd',font:{size:9}},grid:{color:'#2a3450'}}}}});
});
</script></body></html>`;

fs.writeFileSync(path.join(OUT, 'index.html'), html);
console.log('生成完成 index.html + data.json @', genStamp, '週' + checkpointWd);
for (const p of POOLS) console.log(`  ${p.name}: 當期${p.current} 已跑${p.elapsed}天(${p.expFrac}%) 實際${p.pool.actual}/應達${p.pool.expNow}=${p.pool.ratio}% 推估${p.pool.projected}/均${p.pool.target} | 落後:[${p.diag.behind.join(',')}] 略慢:[${p.diag.watch.join(',')}]`);
