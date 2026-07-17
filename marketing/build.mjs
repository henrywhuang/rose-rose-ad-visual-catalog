// 動態流量池監控台生成器 v2（自包含，Node18+ 內建 fetch，無需 npm 依賴）。
// 框架：Arkio/OKR 月度目標 vs 時間進度 → 渠道供應診斷 → 每期健康基準與趨勢。
// 由 GitHub Actions 每週三、週五 09:00(台北) 自動執行，或本機 node marketing/build.mjs。
// 需環境變數 LARK_APP_ID / LARK_APP_SECRET（本機可放 ../.lark_app）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dir;
if (!process.env.LARK_APP_ID) {
  const cf = path.resolve(__dir, '..', '..', '.lark_app');
  if (fs.existsSync(cf)) for (const l of fs.readFileSync(cf, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Za-z_]+)\s*=\s*(.+?)\s*$/); if (m) process.env[m[1].toUpperCase()] ??= m[2]; }
}
const APP_ID = process.env.LARK_APP_ID, APP_SECRET = process.env.LARK_APP_SECRET;
if (!APP_ID || !APP_SECRET) { console.error('缺 LARK_APP_ID / LARK_APP_SECRET'); process.exit(1); }
const BASE = 'https://open.larksuite.com/open-apis';
const APP = 'basusvQmREyWA52Egg9UdF0JZIe';
const CFG_TABLE = 'tblJ2USmoL6hL8uA', RD_TABLE = 'tbl7BVA7sBJRfUj5', EN_TABLE = 'tblgNYfP4gyrTqDq', GOAL_TABLE = 'tblu9luIi3GNOpQq';

const DAY = 86400000, TZ = 8 * 3600000; // 台北 UTC+8（無夏令）
const now = Date.now();
const tpNow = new Date(now + TZ);
const WD = ['日', '一', '二', '三', '四', '五', '六'];
const genStamp = tpNow.toISOString().slice(0, 16).replace('T', ' ');
const checkpointWd = WD[tpNow.getUTCDay()];
const curYM = tpNow.toISOString().slice(0, 7);
const ymOf = ts => new Date(ts + TZ).toISOString().slice(0, 7);
const tpDayKey = ts => new Date(ts + TZ).toISOString().slice(0, 10);
// 近 n 個月的 YYYY-MM（含當月），由近到遠反轉為由遠到近
function recentMonths(n) {
  const out = []; let y = tpNow.getUTCFullYear(), m = tpNow.getUTCMonth();
  for (let i = 0; i < n; i++) { out.unshift(`${y}-${String(m + 1).padStart(2, '0')}`); m--; if (m < 0) { m = 11; y--; } }
  return out;
}
const MONTHS = recentMonths(5); // 2026-03 .. 07

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

// ---- OKR 月目標（年度目標表當月列）----
const goalRaw = await pull(GOAL_TABLE);
const gflat = v => { const s = txt(v); const n = parseFloat(s); return isNaN(n) ? s : n; };
const goalRow = goalRaw.map(r => r.fields).find(f => txt(f['年度-月份']) === curYM) || {};
const OKR = {
  ym: curYM,
  // 時間進度用「當日日數 / 當月天數」（與 Rose 的 17/31 口徑一致，實時）
  daysElapsed: tpNow.getUTCDate(),
  daysInMonth: new Date(Date.UTC(tpNow.getUTCFullYear(), tpNow.getUTCMonth() + 1, 0)).getUTCDate(),
  targetRead: Number(gflat(goalRow['🎯閱｜月自有'])) || 0,
  targetEng: Number(gflat(goalRow['🎯英｜月自有'])) || 0,
};
OKR.timeProg = OKR.daysElapsed / OKR.daysInMonth;

// ---- 統計工具 ----
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const sd = a => { const m = mean(a); return a.length ? Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) : 0; };
const R = v => Math.round(v * 10) / 10, R0 = v => Math.round(v);
const PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#0ea5e9', '#14b8a6', '#ec4899', '#84cc16', '#f97316', '#64748b', '#eab308', '#06b6d4', '#d946ef'];
const OWNED = new Set(['公域流量', '私域流量']);

// 某科目自有(公+私)本月至今 / 上月 / 各月，並拆公私
function subjectMonthly(recs) {
  const m = {}; for (const ym of MONTHS) m[ym] = { all: 0, pub: 0, pri: 0 };
  for (const r of recs) { if (!r.ts) continue; const y = ymOf(r.ts); if (!m[y]) continue; if (r.cat === '公域流量') { m[y].pub++; m[y].all++; } else if (r.cat === '私域流量') { m[y].pri++; m[y].all++; } }
  return m;
}

// 一個池（科目+分類集合）：每期健康基準 + 每月渠道供應
function analyzePool(name, key, recs, cats, periodWin) {
  const inPool = recs.filter(r => r.period != null && cats.has(r.cat));
  const allPeriods = [...new Set(inPool.map(r => r.period))].sort((a, b) => a - b);
  const current = allPeriods[allPeriods.length - 1];
  const winPeriods = allPeriods.slice(-periodWin);
  const completed = winPeriods.filter(p => p < current); // 排除當期(未完成)做基準

  const subs = [...new Set(inPool.filter(r => winPeriods.includes(r.period)).map(r => r.sub || '(未分類)'))];
  // 每期序列（視窗）與每月計數
  const monthCount = {}; // sub -> {ym:count}
  for (const r of inPool) { if (!r.ts) continue; const y = ymOf(r.ts); if (!MONTHS.includes(y)) continue; const s = r.sub || '(未分類)'; (monthCount[s] ??= {}); monthCount[s][y] = (monthCount[s][y] || 0) + 1; }

  const channels = subs.map(s => {
    const seriesWin = winPeriods.map(p => inPool.filter(r => r.period === p && (r.sub || '(未分類)') === s).length);
    const baseSeries = completed.map(p => inPool.filter(r => r.period === p && (r.sub || '(未分類)') === s).length);
    const m = mean(baseSeries), sdev = sd(baseSeries);
    const mc = monthCount[s] || {};
    const prevMonths = MONTHS.slice(0, -1);                 // 完整月
    const norm = mean(prevMonths.slice(-3).map(y => mc[y] || 0)); // 近3完整月 月均
    const lastMon = mc[MONTHS[MONTHS.length - 2]] || 0;     // 上月
    const mtd = mc[curYM] || 0;                             // 本月至今
    const proj = OKR.timeProg > 0.02 ? mtd / OKR.timeProg : mtd; // 推估月底
    const gap = Math.max(0, norm - proj);
    const dropPct = lastMon > 0 ? (proj - lastMon) / lastMon * 100 : (proj > 0 ? 100 : 0);
    const recent3 = seriesWin.slice(-3);                    // 最近3期(含當期)
    const recentDone = baseSeries.slice(-3);               // 最近3完整期
    const retired = recentDone.length >= 3 && recentDone.every(v => v === 0) && baseSeries.some(v => v > 0); // 近3完整期歸零＝退場
    // 健康（每期 vs 基準帶）：近期完整期平均與帶比較
    const rmean = mean(recentDone);
    let health = 'ok';
    if (m < 1.5 || retired) health = 'small';
    else if (rmean >= m + sdev) health = 'boom';
    else if (rmean <= m - sdev) health = 'warn';
    // 供應診斷（月）：是否量不夠 / 突降（僅對有份量的渠道 norm≥3）
    let supply = 'ok';
    if (norm < 3 || retired) supply = 'small';
    else if (proj <= norm * 0.7 || dropPct <= -35) supply = 'behind';
    else if (proj < norm * 0.9 || dropPct <= -20) supply = 'watch';
    else if (proj >= norm * 1.15) supply = 'ahead';
    return {
      name: s, color: '', seriesWin, mean: R(m), sd: R(sdev),
      lo: R0(Math.max(0, m - sdev)), hi: R0(m + sdev), boom: R0(m + 2 * sdev), warn: R0(Math.max(0, m - sdev)),
      recent3, norm: R(norm), lastMon, mtd, proj: R0(proj), gap: R0(gap), dropPct: R0(dropPct),
      health, supply,
    };
  }).sort((a, b) => b.norm - a.norm || b.mean - a.mean);
  channels.forEach((c, i) => c.color = PALETTE[i % PALETTE.length]);

  const totSeriesWin = winPeriods.map(p => inPool.filter(r => r.period === p).length);
  const totBase = completed.map(p => inPool.filter(r => r.period === p).length);
  const pm = mean(totBase), ps = sd(totBase);

  return {
    key, name, current, winPeriods, completedCount: completed.length,
    band: { mean: R(pm), sd: R(ps), lo: R0(pm - ps), hi: R0(pm + ps), boom: R0(pm + 2 * ps), crash: R0(pm - 2 * ps) },
    totSeriesWin,
    channels,
  };
}

// ---- 科目 OKR ----
function subjectOKR(name, key, recs, target) {
  const mm = subjectMonthly(recs);
  const cur = mm[curYM], prev = mm[MONTHS[MONTHS.length - 2]];
  const actual = cur.all, prog = target > 0 ? actual / target : 0;
  const proj = OKR.timeProg > 0.02 ? actual / OKR.timeProg : actual;
  const diff = prog - OKR.timeProg;                         // 百分點差（正=超前）
  const remain = Math.max(0, target - actual);
  const remainDays = Math.max(0.5, OKR.daysInMonth - OKR.daysElapsed);
  const dayRateNow = OKR.daysElapsed > 0 ? actual / OKR.daysElapsed : 0;
  return {
    name, key, target, actual, actualPub: cur.pub, actualPri: cur.pri,
    prog: R(prog * 100), timeProg: R(OKR.timeProg * 100), diff: R(diff * 100),
    proj: R0(proj), attain: R(target > 0 ? proj / target * 100 : 0), gap: R0(Math.max(0, target - proj)),
    remain, needPerDay: R(remain / remainDays), dayRateNow: R(dayRateNow),
    lastMonAll: prev.all,
    status: diff < -0.02 ? 'behind' : diff < 0 ? 'watch' : 'ahead',
  };
}

const okrRead = subjectOKR('閱讀', 'read', rd, OKR.targetRead);
const okrEng = subjectOKR('英語', 'en', en, OKR.targetEng);

const POOLS = [
  analyzePool('閱讀｜自有流量池', 'read', rd, new Set(['公域流量', '私域流量']), 20),
  analyzePool('英語｜公領域', 'en_pub', en, new Set(['公域流量']), 17),
  analyzePool('英語｜私領域', 'en_pri', en, new Set(['私域流量']), 17),
];
// 把池掛到科目
const SUBJECTS = [
  { ...okrRead, poolKeys: ['read'] },
  { ...okrEng, poolKeys: ['en_pub', 'en_pri'] },
];

const payload = { genStamp, checkpointWd, tpDate: tpNow.toISOString().slice(0, 10), OKR, subjects: SUBJECTS, pools: POOLS, months: MONTHS };
fs.writeFileSync(path.join(OUT, 'data.json'), JSON.stringify(payload, null, 1));

// ================= HTML =================
const html = `<!doctype html>
<html lang="zh-Hant"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>OKR 流量監控台｜閱讀・英語</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
:root{--bg:#0b1020;--card:#151b2e;--card2:#1b2338;--line:#2a3450;--txt:#e8ecf6;--sub:#96a0bd;--good:#22c55e;--warn:#ef4444;--watch:#f59e0b;--ahead:#38bdf8;--boom:#facc15;--accent:#6366f1}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;background:linear-gradient(180deg,#0b1020,#0e1428);color:var(--txt);font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif;line-height:1.6;padding-bottom:60px}
.wrap{max-width:920px;margin:0 auto;padding:16px 13px}
h1{font-size:19px;margin:0 0 3px}
.meta{color:var(--sub);font-size:12px}
.sec-t{font-size:13px;color:var(--sub);font-weight:700;letter-spacing:1px;margin:22px 4px 8px;text-transform:uppercase}
.okr{display:grid;grid-template-columns:1fr 1fr;gap:11px}
@media(max-width:560px){.okr{grid-template-columns:1fr}}
.ocard{border-radius:16px;padding:15px;border:1px solid}
.ocard.behind{background:linear-gradient(135deg,#2a1416,#1a1220);border-color:#7f1d1d}
.ocard.watch{background:linear-gradient(135deg,#2a2312,#1a1622);border-color:#7c5e12}
.ocard.ahead{background:linear-gradient(135deg,#0f2417,#121a22);border-color:#1e5b39}
.ocard .hd{display:flex;justify-content:space-between;align-items:baseline}
.ocard .nm{font-size:16px;font-weight:800}
.ocard .df{font-size:15px;font-weight:800}
.ocard .big{font-size:27px;font-weight:800;margin:6px 0 2px}
.ocard .big small{font-size:14px;color:var(--sub);font-weight:600}
.dualbar{margin:10px 0 4px}
.dualbar .lab{display:flex;justify-content:space-between;font-size:11px;color:var(--sub);margin-bottom:3px}
.track{height:9px;background:#25304d;border-radius:5px;position:relative;overflow:hidden}
.track > i{position:absolute;left:0;top:0;height:100%;border-radius:5px}
.track > .tick{position:absolute;top:-2px;width:2px;height:13px;background:#e8ecf6;opacity:.85}
.ocard .row2{display:flex;gap:6px;font-size:11.5px;color:var(--sub);margin-top:8px;flex-wrap:wrap}
.ocard .row2 b{color:var(--txt)}
.chip{background:#0000002e;border:1px solid var(--line);border-radius:8px;padding:3px 8px}
nav.tabs{position:sticky;top:0;z-index:9;display:flex;gap:8px;padding:9px 0;background:#0b1020ee;backdrop-filter:blur(6px);overflow-x:auto}
nav.tabs button{flex:0 0 auto;border:1px solid var(--line);background:var(--card);color:var(--sub);border-radius:999px;padding:7px 14px;font-size:13px;font-weight:600;position:relative}
nav.tabs button.on{background:var(--accent);color:#fff;border-color:var(--accent)}
nav.tabs button .badge{position:absolute;top:-5px;right:-5px;background:var(--warn);color:#fff;font-size:10px;min-width:16px;height:16px;line-height:16px;border-radius:8px;padding:0 3px}
section.pool{display:none}section.pool.on{display:block}
h2{font-size:16px;margin:8px 0 2px}
.span{color:var(--sub);font-size:11.5px;margin-bottom:8px}
.sub-t{font-size:12px;color:var(--txt);font-weight:700;margin:14px 4px 4px}
.summary{border-radius:13px;padding:12px 13px;margin:9px 0;font-size:13px;border:1px solid;background:var(--card2);border-color:var(--line)}
.summary.red{background:#2a1416;border-color:#7f1d1d}.summary.green{background:#0f2417;border-color:#1e5b39}
.summary .hd{font-weight:800;font-size:14px;margin-bottom:4px}
.summary ul{margin:5px 0 0;padding-left:17px}.summary li{margin:2px 0}
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:13px;margin:10px 0;-webkit-overflow-scrolling:touch}
table{border-collapse:collapse;width:100%;font-size:12px;white-space:nowrap}
th,td{padding:7px 9px;text-align:right;border-bottom:1px solid var(--line)}
th:first-child,td:first-child{text-align:left;position:sticky;left:0;background:var(--card);z-index:1}
thead th{background:var(--card2);color:var(--sub);position:sticky;top:0}
.st{font-weight:700;font-size:10.5px;padding:2px 7px;border-radius:999px;display:inline-block}
.st.behind,.st.warn{background:#3a1518;color:#fca5a5}.st.watch{background:#3a2c12;color:#fcd34d}
.st.ok{background:#123322;color:#86efac}.st.ahead,.st.boom{background:#0e2c3d;color:#7dd3fc}.st.small{background:#20263a;color:#96a0bd}
.chan-name{display:flex;align-items:center;gap:6px}.dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto}
.neg{color:#fca5a5}.pos{color:#86efac}
details{margin:8px 0}summary{cursor:pointer;color:var(--sub);font-size:13px;padding:6px 2px}
.chartbox{background:var(--card);border:1px solid var(--line);border-radius:13px;padding:12px 8px 8px;margin:10px 0}
.chartbox h3{margin:2px 8px 8px;font-size:13px;color:var(--sub)}
.note{background:var(--card);border:1px solid var(--line);border-radius:11px;padding:9px 12px;font-size:11.5px;color:var(--sub);margin:9px 0}
.note b{color:var(--txt)}
.foot{color:var(--sub);font-size:11px;text-align:center;margin-top:24px;line-height:1.8}
td.excl{color:var(--sub);font-style:italic}
</style></head><body><div class="wrap">
<h1>OKR 流量監控台 · 閱讀 / 英語</h1>
<div class="meta">月目標 vs 時間進度 → 渠道供應診斷 → 每期健康基準 · 自動更新每週三・五 09:00（台北）</div>

<div class="sec-t">① 當月 OKR 進度（自有領課）</div>
<div id="okr" class="okr"></div>
<div class="note">月進度＝當月至今自有領課 ÷ 月目標；時間進度＝已過天數 ÷ 當月天數（白線）。<b>月進度低於白線＝落後</b>，落後的百分點就是最該補的缺口。推估月底＝當月至今 ÷ 時間進度。</div>

<div class="sec-t">② 各渠道供應診斷 + 健康基準</div>
<nav class="tabs" id="tabs"></nav>
<div id="pools"></div>
<div class="foot">Rose Rose 行銷部 · OKR 自有流量監控<br>資料源 Lark Base（年度目標＋體驗營追蹤）· 最後更新 <span id="ls"></span></div>
</div>
<script>
const DATA = ${JSON.stringify(payload)};
document.getElementById('ls').textContent = DATA.genStamp + '（台北）';
const O = DATA.OKR;
const okrEl = document.getElementById('okr');

DATA.subjects.forEach(s => {
  const cls = s.status;
  const dsign = s.diff >= 0 ? '+' : '';
  const dtxt = s.diff >= 0 ? ('超前 ' + s.diff.toFixed(1) + ' pt') : ('落後 ' + Math.abs(s.diff).toFixed(1) + ' pt');
  const progW = Math.min(100, s.prog), timeX = Math.min(100, s.timeProg);
  const barCol = s.status === 'behind' ? 'var(--warn)' : s.status === 'watch' ? 'var(--watch)' : 'var(--good)';
  const div = document.createElement('div');
  div.className = 'ocard ' + cls;
  div.innerHTML =
    '<div class="hd"><div class="nm">' + s.name + '</div><div class="df ' + (s.diff>=0?'pos':'neg') + '">' + (s.diff>=0?'🟢 ':'🔴 ') + dtxt + '</div></div>' +
    '<div class="big">' + s.actual + '<small> / ' + s.target + ' 人　(' + s.prog.toFixed(1) + '%)</small></div>' +
    '<div class="dualbar"><div class="lab"><span>月進度 ' + s.prog.toFixed(1) + '%</span><span>時間 ' + s.timeProg.toFixed(1) + '% (' + O.daysElapsed + '/' + O.daysInMonth + '天)</span></div>' +
    '<div class="track"><i style="width:' + progW + '%;background:' + barCol + '"></i><span class="tick" style="left:' + timeX + '%"></span></div></div>' +
    '<div class="row2">' +
      '<span class="chip">推估月底 <b>' + s.proj + '</b>（達成 ' + s.attain.toFixed(0) + '%）</span>' +
      (s.gap>0?'<span class="chip">預估缺口 <b class="neg">' + s.gap + '</b> 人</span>':'<span class="chip pos">預估達標 ✓</span>') +
      '<span class="chip">尚缺 <b>' + s.remain + '</b>／需日均 <b>' + s.needPerDay + '</b>（近日均 ' + s.dayRateNow + '）</span>' +
      (s.actualPub!==undefined&&s.name==='英語'?'<span class="chip">公域 '+s.actualPub+' ／ 私域 '+s.actualPri+'</span>':'') +
      '<span class="chip">上月 ' + s.lastMonAll + '</span>' +
    '</div>';
  okrEl.appendChild(div);
});

const tabs = document.getElementById('tabs'), poolsEl = document.getElementById('pools');
const stName = { behind:'🔴 落後', warn:'🔴 警訊', watch:'🟡 留意', ok:'🟢 正常', ahead:'🔥 超前', boom:'🔥 特好', small:'· 量小' };
const poolSubject = { read:'閱讀', en_pub:'英語', en_pri:'英語' };

DATA.pools.forEach((p, idx) => {
  const nBad = p.channels.filter(c=>c.supply==='behind').length;
  const btn = document.createElement('button');
  btn.innerHTML = p.name.replace('｜','·') + (nBad?'<span class="badge">'+nBad+'</span>':'');
  btn.className = idx===0?'on':'';
  btn.onclick = () => { document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.remove('on')); document.querySelectorAll('section.pool').forEach(s=>s.classList.remove('on')); btn.classList.add('on'); document.getElementById('sec-'+p.key).classList.add('on'); };
  tabs.appendChild(btn);

  const behind = p.channels.filter(c=>c.supply==='behind');
  const watch = p.channels.filter(c=>c.supply==='watch');
  const warnHealth = p.channels.filter(c=>c.health==='warn');
  const subj = DATA.subjects.find(s=>s.poolKeys.includes(p.key));
  const poolBehind = subj && subj.status==='behind';

  let sum = '<div class="summary '+(behind.length||poolBehind?'red':'green')+'">';
  sum += '<div class="hd">'+(behind.length?('⚠️ '+behind.length+' 個渠道供應不足，需補量'):'✅ 各渠道供應大致正常')+'</div>';
  if (behind.length){ sum+='<ul>'; behind.forEach(c=>{ sum+='<li><b>'+c.name+'</b>：推估月底 '+c.proj+'（月均 '+c.norm+'）'+(c.gap>0?'，缺 <b>'+c.gap+'</b>':'')+(c.dropPct<=-20?'，較上月 <b class="neg">'+c.dropPct+'%</b>':'')+'　→ 建議加推'+(c.health==='warn'?'（近期已跌破警訊帶）':'')+'</li>'; }); sum+='</ul>'; }
  if (watch.length) sum += '<div style="margin-top:5px">🟡 留意：'+watch.map(c=>c.name+'('+c.dropPct+'%)').join('、')+'</div>';
  if (warnHealth.length) sum += '<div style="margin-top:3px">🔴 已在警訊帶（近期<平均−1σ）：<b>'+warnHealth.map(c=>c.name).join('、')+'</b></div>';
  const aheadC = p.channels.filter(c=>c.supply==='ahead');
  if (aheadC.length) sum += '<div style="margin-top:3px">🔥 超前可調配：'+aheadC.map(c=>c.name).join('、')+'</div>';
  sum += '</div>';

  const sec = document.createElement('section');
  sec.className='pool'+(idx===0?' on':''); sec.id='sec-'+p.key;
  const b=p.band;
  sec.innerHTML =
    '<h2>'+p.name+' <span style="font-size:11px;color:var(--sub)">（'+poolSubject[p.key]+' 科目）</span></h2>'+
    '<div class="span">視窗 '+p.winPeriods[0]+'–'+p.winPeriods[p.winPeriods.length-1]+'期（近'+p.winPeriods.length+'期 ≈4個月）· 每期基準 '+b.mean+'±'+b.sd+'（可接受 '+b.lo+'~'+b.hi+'）</div>'+
    sum+
    '<div class="chartbox"><h3>各渠道逐期進量趨勢（近'+p.winPeriods.length+'期，末期未完成）</h3><canvas id="c-'+p.key+'" height="215"></canvas></div>'+
    '<div class="sub-t">本月供應診斷（月）</div>'+supplyTable(p)+
    '<div class="sub-t">每期健康基準（平均 / 可接受帶 / 特好 / 警訊）</div>'+healthTable(p)+
    '<details><summary>展開｜各渠道逐期明細（'+p.winPeriods.length+'期）</summary>'+detailTable(p)+'</details>';
  poolsEl.appendChild(sec);
});

function supplyTable(p){
  const ord={behind:0,watch:1,ok:2,ahead:3,small:4};
  let h='<div class="tablewrap"><table><thead><tr><th>渠道</th><th>月均</th><th>上月</th><th>本月至今</th><th>推估月底</th><th>月比</th><th>供應</th><th>建議</th></tr></thead><tbody>';
  [...p.channels].sort((a,b)=>ord[a.supply]-ord[b.supply]||b.norm-a.norm).forEach(c=>{
    const nw=c.supply==='small';
    const drop=c.dropPct>=0?'<span class="pos">+'+c.dropPct+'%</span>':'<span class="neg">'+c.dropPct+'%</span>';
    const sug=c.supply==='behind'?'加推補量':c.supply==='watch'?'觀察':c.supply==='ahead'?'可調配':'—';
    h+='<tr><td><span class="chan-name"><span class="dot" style="background:'+c.color+'"></span>'+c.name+'</span></td>'+
      '<td>'+c.norm+'</td><td>'+c.lastMon+'</td><td><b>'+c.mtd+'</b></td><td>'+c.proj+'</td>'+
      '<td>'+(nw?'—':drop)+'</td><td><span class="st '+c.supply+'">'+stName[c.supply]+'</span></td>'+
      '<td>'+sug+'</td></tr>';
  });
  h+='</tbody></table></div>';
  return h;
}
function healthTable(p){
  let h='<div class="tablewrap"><table><thead><tr><th>渠道</th><th>每期平均</th><th>可接受帶</th><th>特好≥</th><th>警訊≤</th><th>最近3期</th><th>狀態</th></tr></thead><tbody>';
  p.channels.forEach(c=>{
    h+='<tr><td><span class="chan-name"><span class="dot" style="background:'+c.color+'"></span>'+c.name+'</span></td>'+
      '<td><b>'+c.mean+'</b></td><td>'+c.lo+'~'+c.hi+'</td>'+
      '<td style="color:var(--boom)">'+c.hi+'</td><td style="color:var(--warn)">'+c.lo+'</td>'+
      '<td>'+c.recent3.join(' · ')+'</td><td><span class="st '+c.health+'">'+stName[c.health]+'</span></td></tr>';
  });
  h+='</tbody></table></div>';
  return h;
}
function detailTable(p){
  let h='<div class="tablewrap"><table><thead><tr><th>渠道</th>';
  p.winPeriods.forEach((pp,i)=>{ h+='<th'+(i===p.winPeriods.length-1?' class="excl"':'')+'>'+pp+(i===p.winPeriods.length-1?'⚠':'')+'</th>'; });
  h+='</tr></thead><tbody>';
  p.channels.forEach(c=>{
    h+='<tr><td><span class="chan-name"><span class="dot" style="background:'+c.color+'"></span>'+c.name+'</span></td>';
    c.seriesWin.forEach((v,i)=>{
      const last=i===p.winPeriods.length-1;
      const cls=last?' class="excl"':(v>=c.hi&&v>0?' style="color:var(--boom);font-weight:700"':(v<=c.lo&&v>0?' style="color:var(--warn)"':''));
      h+='<td'+cls+'>'+v+'</td>';
    });
    h+='</tr>';
  });
  h+='<tr><td><b>每期總計</b></td>';
  p.totSeriesWin.forEach((v,i)=>{ h+='<td'+(i===p.winPeriods.length-1?' class="excl"':'')+'><b>'+v+'</b></td>'; });
  h+='</tr></tbody></table></div>';
  return h;
}
DATA.pools.forEach(p=>{
  new Chart(document.getElementById('c-'+p.key),{type:'bar',
    data:{labels:p.winPeriods,datasets:p.channels.map(c=>({label:c.name,data:c.seriesWin,backgroundColor:c.color,borderWidth:0,stack:'s'}))},
    options:{responsive:true,maintainAspectRatio:true,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:'#96a0bd',font:{size:9},boxWidth:10,padding:5}},tooltip:{callbacks:{footer:it=>'合計 '+it.reduce((a,b)=>a+b.parsed.y,0)}}},
      scales:{x:{stacked:true,ticks:{color:'#96a0bd',font:{size:8}},grid:{display:false}},y:{stacked:true,ticks:{color:'#96a0bd',font:{size:8}},grid:{color:'#2a3450'}}}}});
});
</script></body></html>`;

fs.writeFileSync(path.join(OUT, 'index.html'), html);
console.log('生成完成 @', genStamp, '週' + checkpointWd, '| 當月', curYM, 'Days', OKR.daysElapsed + '/' + OKR.daysInMonth, '時間進度', R(OKR.timeProg * 100) + '%');
for (const s of SUBJECTS) console.log(`  [OKR] ${s.name}: ${s.actual}/${s.target} = ${s.prog}% vs 時間 ${s.timeProg}% → ${s.diff >= 0 ? '超前' : '落後'} ${Math.abs(s.diff)}pt | 推估月底 ${s.proj}(達成${s.attain}%) 缺口${s.gap}`);
for (const p of POOLS) console.log(`  [池] ${p.name}: 供應不足[${p.channels.filter(c => c.supply === 'behind').map(c => c.name + '↓' + c.dropPct + '%').join(',')}] 警訊帶[${p.channels.filter(c => c.health === 'warn').map(c => c.name).join(',')}]`);
