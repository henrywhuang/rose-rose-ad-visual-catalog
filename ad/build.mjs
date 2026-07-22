// 廣告投放 OKR 動態監控台生成器（自包含，Node18+ 內建 fetch，無 npm 依賴）。
// 資料源：Arkio Ad Pilot dashboard（GET /api/v1/ad-budget/dashboard，Bearer 憑證）。
// 篩選：campaign_name 或 adset 名稱含 "rose"（不分大小寫）。主數字＝Ads Manager 成果口徑(leads_meta)，backend 作校驗。
// 累計法：把每次抓到的 trend_30d 每日領課併入持久帳本 ledger.json（同日以最新一次覆蓋，處理回補），
//        因此 Q3 累計可跨越 30 天視窗，8 月後仍算得到 7/1 起的總量。
// 由 GitHub Actions 每天 09:00(台北) 自動更新，或本機 `node ad/build.mjs`。
// 憑證：環境變數 ARKIO_TOKEN，本機退回讀 ../../.arkio_token。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dir;
const LEDGER_PATH = path.join(OUT, 'ledger.json');

// ============== 設定（Rose 給定目標，可調整）==============
const QUARTER = { label: '2026-Q3', start: '2026-07-01', end: '2026-09-30', totalDays: 92, months: ['2026-07', '2026-08', '2026-09'] };
const READING = { key: 'read', name: '閱讀', q3Target: 3360, monthTargets: { '2026-07': 950, '2026-08': 1160, '2026-09': 1250 } };
// 英語：OKR 圖示「English K2 領課50」為參考；Rose 本次僅要求追蹤數量，目標待確認。
const ENGLISH = { key: 'en', name: '英語', q3Target: 50, monthTargets: { '2026-07': null, '2026-08': null, '2026-09': null }, ref: true };
const WEEK_DIVISOR = 4;          // 單週合格線＝該週所屬月目標 ÷ 4（Rose 口徑：7月 950/4≈238）
const PRIMARY = 'm';             // 主口徑 m=成果(meta) / b=後端(backend)
const RECENT_DAYS = 10;          // 「近N天上架廣告分析」視窗
const API = 'https://www.arkio.me/api/v1/ad-budget/dashboard';
const CREATIVE_API = 'https://www.arkio.me/api/v1/marketing/creative-library/';
const ROSE_RE = /rose/i;
// 投放主（social_account_code → 粉專中文名），未列出者顯示原代碼
const PAGE_NAME = {
  child_wiki: '育兒小百科', parent_reading: '愛共讀', easylearning_tw: '輕鬆學',
  little_pages_club: '小頁俱樂部', mommy_emilylee: 'Emily 媽咪', claire_tw: 'Claire',
  jojoreading_tw: 'JOJO 閱讀',
};
const numOf = s => { const m = String(s || '').match(/\b(2[0-9]{4})\b/); return m ? m[1] : null; }; // 廣告編號(如25982)
const theme = s => String(s || '').replace(/^\s*2[0-9]{4}\s*/, '').replace(/[（(]\s*Rose\s*[)）]/ig, '').replace(/[-\s]*[ABＡＢ]$/,'').replace(/[✅👌🪝❌]/g,'').replace(/\s+/g,' ').trim();

// ============== 時間工具（台北 UTC+8）==============
const DAY = 86400000, TZ = 8 * 3600000;
const now = Date.now();
const tpNow = new Date(now + TZ);
const WD = ['日', '一', '二', '三', '四', '五', '六'];
const genStamp = tpNow.toISOString().slice(0, 16).replace('T', ' ');
const checkpointWd = WD[tpNow.getUTCDay()];
const today = tpNow.toISOString().slice(0, 10);
const curYM = today.slice(0, 7);
const dstr = ts => new Date(ts + TZ).toISOString().slice(0, 10);
const dnum = s => Date.parse(s + 'T00:00:00Z');            // 以 UTC 當日 0 點作日期序
const daysInMonth = ym => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const addDays = (s, n) => dstr(dnum(s) - TZ + n * DAY);
// 某日所在週的週一（Mon-Sun）
function mondayOf(s) { const d = new Date(dnum(s)); const wd = (d.getUTCDay() + 6) % 7; return dstr(dnum(s) - TZ - wd * DAY); }

// ============== 取數 ==============
function readToken() {
  if (process.env.ARKIO_TOKEN) return process.env.ARKIO_TOKEN.trim();
  const p = path.resolve(__dir, '..', '..', '.arkio_token');
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  return null;
}
function tokenExp(tok) {
  try { const p = JSON.parse(Buffer.from(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()); return p.exp ? new Date(p.exp * 1000).toISOString().slice(0, 10) : null; } catch { return null; }
}
async function fetchDashboard(tok) {
  const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 30000);
  try {
    const r = await fetch(API, { headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json' }, signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json(); return j.data || j;
  } finally { clearTimeout(to); }
}
// 抓 creative library（分頁），回傳含 Rose 的 creative（附視覺 OSS 圖、投放主、上架日）
async function fetchCreatives(tok) {
  let all = [], page = 1;
  while (page <= 12) {
    const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 25000);
    let list;
    try {
      const r = await fetch(`${CREATIVE_API}?page=${page}&page_size=200`, { headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json' }, signal: ac.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json(); const arr = j.data || j; list = Array.isArray(arr) ? arr : [];
    } finally { clearTimeout(to); }
    all = all.concat(list); if (list.length < 200) break; page++;
  }
  return all.filter(c => ROSE_RE.test(c.name || ''));
}
const imgsOf = c => { try { return JSON.parse(c.assets || '[]').filter(a => a.kind === 'image' && a.gcs_url).map(a => a.gcs_url); } catch { return []; } };

// ============== 帳本累計 ==============
function loadLedger() {
  if (fs.existsSync(LEDGER_PATH)) { try { return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')); } catch { } }
  return { adsets: {}, last_fetch: null, last_fetch_status: null };
}
function mergeSnapshot(ledger, root) {
  const ads = (root.adsets || []).filter(a => ROSE_RE.test(a.campaign_name || '') || ROSE_RE.test(a.name || ''));
  for (const a of ads) {
    const t = a.trend_30d || {}; const dates = t.dates || [];
    const e = ledger.adsets[a.id] || { daily: {} };
    // 併入每日（限本季範圍，最新覆蓋）
    for (let i = 0; i < dates.length; i++) {
      const d = dates[i]; if (d < QUARTER.start || d > QUARTER.end || d > today) continue;
      e.daily[d] = { m: t.leads_meta?.[i] ?? 0, b: t.leads_backend?.[i] ?? 0, s: t.spend?.[i] ?? 0 };
    }
    // 更新中繼資料（最新一次為準）
    Object.assign(e, {
      id: a.id, name: a.name, campaign_name: a.campaign_name, business_line: a.business_line,
      account: a.account, status: a.status, route_key: a.route_key, daily_budget: a.daily_budget,
      primary_metric: a.primary_metric, primary_cost: a.primary_cost, cpi_7d: a.cpi_7d, cpi_30d: a.cpi_30d,
      benchmark: a.benchmark || null, advice: a.advice || null,
      trend_change: a.trend_change, trend_improving: a.trend_improving, trend_worsening: a.trend_worsening,
      decline_type: a.decline_type, is_new_creative: a.is_new_creative, new_creative_phase: a.new_creative_phase,
      last7: a.last_7d || null, last_seen: today,
    });
    ledger.adsets[a.id] = e;
  }
  return ads.length;
}

// ============== 主流程 ==============
const ledger = loadLedger();
const tok = readToken();
let fetchStatus = 'error', expDate = tok ? tokenExp(tok) : null, nAds = 0, companyGoals = null, roseCreatives = [];
if (!tok) { console.error('⚠ 無 ARKIO_TOKEN，改用既有帳本輸出（資料不更新）'); }
else {
  try {
    const root = await fetchDashboard(tok);
    nAds = mergeSnapshot(ledger, root);
    companyGoals = root.goals || null;
    fetchStatus = 'ok';
    ledger.last_fetch = genStamp; ledger.last_fetch_status = 'ok';
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 0));
    console.log(`✓ 抓取成功，Rose 廣告 ${nAds} 檔併入帳本`);
  } catch (e) {
    fetchStatus = 'stale'; ledger.last_fetch_status = 'stale:' + e.message;
    console.error('⚠ 抓取失敗，改用既有帳本：', e.message);
  }
  try {
    const cr = await fetchCreatives(tok);
    // 精簡保存（只留看板需要的欄位），供抓取失敗時回退
    roseCreatives = cr.map(c => ({ name: c.name, social_account_code: c.social_account_code, uploaded_at: c.uploaded_at, meta_pushed_at: c.meta_pushed_at, project_code: c.project_code, assets: c.assets }));
    if (roseCreatives.length) { ledger.creatives = roseCreatives; fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 0)); }
    console.log(`✓ creative library：Rose 素材 ${roseCreatives.length} 個`);
  } catch (e) { console.error('⚠ creative library 抓取失敗，回退帳本既有素材：', e.message); }
}
if (!roseCreatives.length && Array.isArray(ledger.creatives)) roseCreatives = ledger.creatives;

// ---- 從帳本計算 ----
const R = v => Math.round(v * 10) / 10, R0 = v => Math.round(v);
const PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#0ea5e9', '#14b8a6', '#ec4899', '#84cc16', '#f97316', '#64748b', '#eab308'];
const adsetList = Object.values(ledger.adsets);
const dayOfQuarter = Math.max(1, Math.round((dnum(today) - dnum(QUARTER.start)) / DAY) + 1);
const qTimeProg = Math.min(1, dayOfQuarter / QUARTER.totalDays);
const dayOfMonth = tpNow.getUTCDate();
const dim = daysInMonth(curYM);
const mTimeProg = dayOfMonth / dim;

// 某業務線的每日合計（跨所有 Rose 廣告）
function dayTotals(bl) {
  const tot = {};
  for (const a of adsetList) { if (a.business_line !== bl) continue; for (const [d, v] of Object.entries(a.daily)) { (tot[d] ??= { m: 0, b: 0, s: 0 }); tot[d].m += v.m; tot[d].b += v.b; tot[d].s += v.s; } }
  return tot;
}
const sumRange = (tot, from, to, key) => Object.entries(tot).reduce((s, [d, v]) => (d >= from && d <= to ? s + v[key] : s), 0);

function subjectAnalysis(SUB) {
  const tot = dayTotals(SUB.name === '閱讀' ? 'Reading' : 'English');
  const P = PRIMARY;
  // Q3 累計
  const q3Actual = sumRange(tot, QUARTER.start, today, P);
  const q3Bk = sumRange(tot, QUARTER.start, today, 'b');
  const q3Proj = qTimeProg > 0.02 ? q3Actual / qTimeProg : q3Actual;
  const q3 = {
    target: SUB.q3Target, actual: R0(q3Actual), actualBk: R0(q3Bk),
    prog: R(SUB.q3Target > 0 ? q3Actual / SUB.q3Target * 100 : 0), timeProg: R(qTimeProg * 100),
    proj: R0(q3Proj), attain: R(SUB.q3Target > 0 ? q3Proj / SUB.q3Target * 100 : 0),
    gap: R0(Math.max(0, SUB.q3Target - q3Proj)), remain: R0(Math.max(0, SUB.q3Target - q3Actual)),
  };
  q3.diff = R(q3.prog - q3.timeProg);
  q3.status = q3.diff < -2 ? 'behind' : q3.diff < 0 ? 'watch' : 'ahead';
  // 各月
  const months = QUARTER.months.map(ym => {
    const from = ym + '-01', to = ym + '-' + String(daysInMonth(ym)).padStart(2, '0');
    const act = sumRange(tot, from, to, P), bk = sumRange(tot, from, to, 'b');
    const tgt = SUB.monthTargets[ym];
    const isCur = ym === curYM, isPast = to < today;
    const tp = isCur ? mTimeProg : (isPast ? 1 : 0);
    const proj = isCur && tp > 0.02 ? act / tp : act;
    return {
      ym, target: tgt, actual: R0(act), actualBk: R0(bk), isCur, isPast,
      proj: R0(isCur ? proj : act), gap: tgt != null ? R0(Math.max(0, tgt - (isCur ? proj : act))) : null,
      prog: tgt ? R(act / tgt * 100) : null, timeProg: R(tp * 100),
      status: tgt == null ? 'na' : (isPast ? (act >= tgt ? 'ahead' : 'behind') : (isCur ? ((act / tgt) >= tp - 0.02 ? 'watch' : 'behind') : 'na')),
    };
  });
  // 當月細節
  const curMonth = months.find(m => m.isCur);
  const monthActual = curMonth.actual;
  const monthTarget = curMonth.target || 0;
  const remainDays = Math.max(0.5, dim - dayOfMonth);
  const monthRemain = Math.max(0, monthTarget - monthActual);
  const recent7 = sumRange(tot, addDays(today, -6), today, P);
  const cur = {
    ym: curYM, target: monthTarget, actual: monthActual, actualBk: curMonth.actualBk,
    prog: monthTarget ? R(monthActual / monthTarget * 100) : 0, timeProg: R(mTimeProg * 100),
    proj: curMonth.proj, attain: monthTarget ? R(curMonth.proj / monthTarget * 100) : 0,
    gap: curMonth.gap, remain: R0(monthRemain), needPerDay: R(monthRemain / remainDays),
    dayRateNow: R(dayOfMonth > 0 ? monthActual / dayOfMonth : 0), recent7Rate: R(recent7 / 7),
    diff: monthTarget ? R(monthActual / monthTarget * 100 - mTimeProg * 100) : 0,
  };
  cur.status = !monthTarget ? 'na' : cur.diff < -2 ? 'behind' : cur.diff < 0 ? 'watch' : 'ahead';
  // 每週（Mon-Sun）
  const weeks = [];
  let wk = mondayOf(QUARTER.start);
  while (wk <= today) {
    const wEnd = addDays(wk, 6);
    const effFrom = wk < QUARTER.start ? QUARTER.start : wk;
    const effTo = wEnd > today ? today : wEnd;
    const monthEnd = wEnd.slice(0, 7);
    const line = SUB.monthTargets[monthEnd] != null ? Math.round(SUB.monthTargets[monthEnd] / WEEK_DIVISOR) : null;
    const act = sumRange(tot, effFrom, effTo, P), bk = sumRange(tot, effFrom, effTo, 'b');
    const isCur = today >= wk && today <= wEnd;
    weeks.push({
      start: wk, end: wEnd, effFrom, effTo, isCur, line,
      actual: R0(act), actualBk: R0(bk),
      gap: line != null ? R0(Math.max(0, line - act)) : null,
      status: line == null ? 'na' : isCur ? (act >= line ? 'pass' : 'current') : (act >= line ? 'pass' : 'fail'),
    });
    wk = addDays(wk, 7);
  }
  return { ...SUB, q3, cur, months, weeks };
}

// ---- 廣告成效排行 + 建議 ----
function adsetRows() {
  return adsetList.map(a => {
    const q3m = sumRange({ 0: 0 }, '', '', 'm'); // placeholder
    let m = 0, b = 0, s = 0, m7 = 0;
    for (const [d, v] of Object.entries(a.daily)) { if (d >= QUARTER.start && d <= today) { m += v.m; b += v.b; s += v.s; } if (d >= addDays(today, -6)) m7 += v.m; }
    const cpl = m > 0 ? s / m : null;
    const bm = a.benchmark || {};
    const adv = a.advice || {};
    const paused = /PAUSED/i.test(a.status || '');
    // 分類
    let tag = 'keep', tagTxt = '✅ 維持';
    if (paused && m >= 8) { tag = 'reactivate'; tagTxt = '⏸ 已暫停(曾有量)'; }
    else if (paused) { tag = 'paused'; tagTxt = '⏸ 已暫停'; }
    else if (a.is_new_creative || /cold_start/i.test(adv.action || '')) { tag = 'testing'; tagTxt = '🧪 測試中'; }
    else if (adv.action === 'SCALE' || (cpl != null && bm.scale_excellent && cpl <= bm.scale_excellent && m >= 10)) { tag = 'scale'; tagTxt = '🔥 加碼'; }
    else if (a.trend_worsening || (cpl != null && bm.danger && cpl >= bm.danger) || a.decline_type) { tag = 'iterate'; tagTxt = '🔧 建議迭代'; }
    return {
      id: a.id, name: a.name, campaign: a.campaign_name, bl: a.business_line, status: a.status, paused,
      m: R0(m), b: R0(b), spend: R0(s), cpl: cpl != null ? R(cpl) : null, m7: R0(m7),
      budget: a.daily_budget, bm, adviceAction: adv.action, adviceText: adv.text, priority: adv.priority,
      suggestedBudget: adv.suggested_budget, trendWorse: a.trend_worsening, trendBetter: a.trend_improving,
      declineType: a.decline_type, tag, tagTxt,
    };
  }).sort((a, b2) => b2.m - a.m);
}

const subjects = [subjectAnalysis(READING), subjectAnalysis(ENGLISH)];
const rows = adsetRows();

// ---- 近N天上架廣告分析（creative library ⋈ 帳本成效）----
function recentAdsAnalysis() {
  const cutoff = addDays(today, -(RECENT_DAYS - 1));
  // 帳本 adset 依編號建成效索引（近N天領課/花費 + 近7日CTR + 狀態）
  const perfByNum = {};
  for (const a of adsetList) {
    const n = numOf(a.name); if (!n) continue;
    let m10 = 0, s10 = 0; for (const [d, v] of Object.entries(a.daily)) { if (d >= cutoff && d <= today) { m10 += v.m; s10 += v.s; } }
    perfByNum[n] = { name: a.name, bl: a.business_line, acct: a.account, status: a.status, paused: /PAUSED/i.test(a.status || ''), m10, s10, ctr7: a.last7?.ctr ?? null, clicks7: a.last7?.clicks ?? null, imp7: a.last7?.impressions ?? null };
  }
  // creative library 依編號分組
  const byNum = {};
  for (const c of roseCreatives) {
    const n = numOf(c.name); if (!n) continue;
    (byNum[n] ??= { num: n, names: [], imgs: [], pages: new Set(), uploaded: [], pushed: false, project: c.project_code });
    const g = byNum[n]; g.names.push(c.name); if (c.social_account_code) g.pages.add(c.social_account_code);
    g.uploaded.push((c.uploaded_at || '').slice(0, 10)); if (c.meta_pushed_at) g.pushed = true;
    for (const u of imgsOf(c)) if (!g.imgs.includes(u)) g.imgs.push(u);
  }
  // 近N天上架：任一 creative 上傳日在視窗內
  const recent = Object.values(byNum).filter(g => g.uploaded.some(d => d && d >= cutoff));
  const out = recent.map(g => {
    const up = g.uploaded.filter(Boolean).sort().pop();
    const p = perfByNum[g.num] || null;
    const m10 = p ? R0(p.m10) : null, s10 = p ? R0(p.s10) : null;
    const cpl = (p && p.m10 > 0) ? R(p.s10 / p.m10) : null;
    const pages = [...g.pages].map(c => ({ code: c, name: PAGE_NAME[c] || c }));
    return {
      num: g.num, theme: theme(g.names[0]), fullname: g.names[0].replace(/[-\s]*[ABＡＢ]$/, ''),
      uploaded: up, imgs: g.imgs.slice(0, 4), pages, pushed: g.pushed,
      bl: p ? p.bl : (/英語|英文|english|abc|字母|發音|單字|letter|phonic/i.test(g.names[0]) ? 'English' : 'Reading'),
      status: p ? p.status : null, hasPerf: !!p,
      m10, s10, cpl, ctr7: p && p.ctr7 != null ? R(p.ctr7) : null,
    };
  });
  // 預設依領課排序（無成效者置底）
  out.sort((a, b) => (b.m10 ?? -1) - (a.m10 ?? -1) || (b.ctr7 ?? -1) - (a.ctr7 ?? -1));
  return { cutoff, days: RECENT_DAYS, items: out };
}
const recentAds = recentAdsAnalysis();

// 補量建議（以閱讀當月為準）
const rd = subjects[0];
const winners = rows.filter(r => r.bl === 'Reading' && !r.paused && r.m7 > 0).sort((a, b) => b.m7 - a.m7);
const winnerDaily = winners.length ? winners[0].m7 / 7 : 0;
const needPerDay = rd.cur.needPerDay;
const addlPerDay = Math.max(0, needPerDay - rd.cur.recent7Rate);
const adsNeeded = winnerDaily > 0 ? Math.ceil(addlPerDay / winnerDaily) : null;
const safe = rd.cur.status === 'ahead' || (rd.cur.gap != null && rd.cur.gap <= 0);
const advice = {
  safe, needPerDay, addlPerDay: R(addlPerDay), winnerDaily: R(winnerDaily), adsNeeded,
  topScale: rows.filter(r => r.tag === 'scale').slice(0, 4),
  iterate: rows.filter(r => r.tag === 'iterate' || r.tag === 'reactivate').slice(0, 5),
  bestByCpl: rows.filter(r => r.m >= 8 && r.cpl != null).sort((a, b) => a.cpl - b.cpl).slice(0, 4),
};
rows.forEach((r, i) => r.color = PALETTE[i % PALETTE.length]);

const payload = {
  genStamp, checkpointWd, today, fetchStatus, expDate, nAds, curYM,
  quarter: QUARTER, dayOfQuarter, dayOfMonth, dim,
  subjects, rows, advice, primary: PRIMARY, recentAds,
  companyNote: companyGoals?.data_quality_warnings || null,
};
fs.writeFileSync(path.join(OUT, 'data.json'), JSON.stringify(payload, null, 1));

// ================= HTML =================
const html = renderHTML(payload);
fs.writeFileSync(path.join(OUT, 'index.html'), html);

console.log(`生成完成 @ ${genStamp} 週${checkpointWd} | Q3 第${dayOfQuarter}/${QUARTER.totalDays}天(${R(qTimeProg * 100)}%) | ${curYM} ${dayOfMonth}/${dim}天`);
for (const s of subjects) console.log(`  [${s.name}] Q3 ${s.q3.actual}/${s.q3.target}(${s.q3.prog}%,推估${s.q3.proj}) | 當月 ${s.cur.actual}/${s.cur.target}(推估${s.cur.proj},缺${s.cur.gap}) ${s.cur.status}`);
console.log(`  [補量] 安全=${safe} 需日均${needPerDay}(近7日均${rd.cur.recent7Rate}) 需再+${R(addlPerDay)}/日 ≈ ${adsNeeded}檔爆款`);
console.log(`  [排行] 加碼:${advice.topScale.map(r => r.name.slice(0, 12)).join(',')} | 迭代:${advice.iterate.map(r => r.name.slice(0, 12)).join(',')}`);
console.log(`  [近${RECENT_DAYS}天上架] ${recentAds.items.length} 檔（上架≥${recentAds.cutoff}）：${recentAds.items.slice(0, 6).map(r => r.theme + '(領' + (r.m10 ?? '-') + ')').join('、')}`);

// ---------- 渲染函式 ----------
function renderHTML(D) {
  const st = JSON.stringify(D);
  return `<!doctype html>
<html lang="zh-Hant"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>廣告 OKR 監控台｜閱讀・英語</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
:root{--bg:#0b1020;--card:#151b2e;--card2:#1b2338;--line:#2a3450;--txt:#e8ecf6;--sub:#96a0bd;--good:#22c55e;--warn:#ef4444;--watch:#f59e0b;--ahead:#38bdf8;--boom:#facc15;--accent:#6366f1}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;background:linear-gradient(180deg,#0b1020,#0e1428);color:var(--txt);font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif;line-height:1.6;padding-bottom:60px}
.wrap{max-width:960px;margin:0 auto;padding:16px 13px}
h1{font-size:19px;margin:0 0 3px}
.meta{color:var(--sub);font-size:12px}
.stale{background:#3a1518;border:1px solid #7f1d1d;color:#fca5a5;border-radius:10px;padding:8px 12px;font-size:12px;margin:10px 0}
.warnbar{background:#2a2312;border:1px solid #7c5e12;color:#fcd34d;border-radius:10px;padding:8px 12px;font-size:12px;margin:10px 0}
.sec-t{font-size:13px;color:var(--sub);font-weight:700;letter-spacing:1px;margin:22px 4px 8px;text-transform:uppercase}
.okr{display:grid;grid-template-columns:1fr 1fr 1fr;gap:11px}
@media(max-width:720px){.okr{grid-template-columns:1fr}}
.ocard{border-radius:16px;padding:15px;border:1px solid}
.ocard.behind{background:linear-gradient(135deg,#2a1416,#1a1220);border-color:#7f1d1d}
.ocard.watch{background:linear-gradient(135deg,#2a2312,#1a1622);border-color:#7c5e12}
.ocard.ahead{background:linear-gradient(135deg,#0f2417,#121a22);border-color:#1e5b39}
.ocard.na{background:var(--card2);border-color:var(--line)}
.ocard .hd{display:flex;justify-content:space-between;align-items:baseline}
.ocard .nm{font-size:15px;font-weight:800}
.ocard .df{font-size:13px;font-weight:800}
.ocard .big{font-size:26px;font-weight:800;margin:6px 0 2px}
.ocard .big small{font-size:13px;color:var(--sub);font-weight:600}
.dualbar{margin:10px 0 4px}
.dualbar .lab{display:flex;justify-content:space-between;font-size:11px;color:var(--sub);margin-bottom:3px}
.track{height:9px;background:#25304d;border-radius:5px;position:relative;overflow:hidden}
.track > i{position:absolute;left:0;top:0;height:100%;border-radius:5px}
.track > .tick{position:absolute;top:-2px;width:2px;height:13px;background:#e8ecf6;opacity:.85}
.ocard .row2{display:flex;gap:6px;font-size:11px;color:var(--sub);margin-top:8px;flex-wrap:wrap}
.ocard .row2 b{color:var(--txt)}
.chip{background:#0000002e;border:1px solid var(--line);border-radius:8px;padding:3px 8px}
.chip.pos{color:#86efac}.chip.neg{color:#fca5a5}
.summary{border-radius:13px;padding:12px 13px;margin:12px 0;font-size:13px;border:1px solid;background:var(--card2);border-color:var(--line)}
.summary.red{background:#2a1416;border-color:#7f1d1d}.summary.green{background:#0f2417;border-color:#1e5b39}
.summary .hd{font-weight:800;font-size:15px;margin-bottom:5px}
.summary ul{margin:5px 0 0;padding-left:17px}.summary li{margin:3px 0}
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:13px;margin:10px 0;-webkit-overflow-scrolling:touch}
table{border-collapse:collapse;width:100%;font-size:12px;white-space:nowrap}
th,td{padding:7px 9px;text-align:right;border-bottom:1px solid var(--line)}
th:first-child,td:first-child{text-align:left;position:sticky;left:0;background:var(--card);z-index:1}
thead th{background:var(--card2);color:var(--sub);position:sticky;top:0}
.st{font-weight:700;font-size:10.5px;padding:2px 7px;border-radius:999px;display:inline-block}
.st.behind,.st.fail{background:#3a1518;color:#fca5a5}.st.watch,.st.current{background:#3a2c12;color:#fcd34d}
.st.pass,.st.ahead{background:#123322;color:#86efac}.st.na{background:#20263a;color:#96a0bd}
.st.scale{background:#3a2412;color:#fdba74}.st.iterate{background:#3a1518;color:#fca5a5}.st.keep{background:#123322;color:#86efac}
.st.testing{background:#1a2c3a;color:#7dd3fc}.st.paused,.st.reactivate{background:#20263a;color:#96a0bd}
.neg{color:#fca5a5}.pos{color:#86efac}
.chan-name{display:flex;align-items:center;gap:6px}.dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto}
details{margin:8px 0}summary{cursor:pointer;color:var(--sub);font-size:13px;padding:6px 2px}
.chartbox{background:var(--card);border:1px solid var(--line);border-radius:13px;padding:12px 8px 8px;margin:10px 0}
.chartbox h3{margin:2px 8px 8px;font-size:13px;color:var(--sub)}
.note{background:var(--card);border:1px solid var(--line);border-radius:11px;padding:9px 12px;font-size:11.5px;color:var(--sub);margin:9px 0}
.note b{color:var(--txt)}
nav.tabs{display:flex;gap:8px;padding:9px 0;overflow-x:auto}
nav.tabs button{flex:0 0 auto;border:1px solid var(--line);background:var(--card);color:var(--sub);border-radius:999px;padding:7px 14px;font-size:13px;font-weight:600}
nav.tabs button.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.foot{color:var(--sub);font-size:11px;text-align:center;margin-top:24px;line-height:1.8}
.pill{display:inline-block;font-size:10px;padding:1px 6px;border-radius:6px;background:#0000002e;border:1px solid var(--line);color:var(--sub);margin-left:5px}
.sortbar{display:flex;gap:7px;align-items:center;flex-wrap:wrap;font-size:12px;color:var(--sub);margin:6px 2px 10px}
.sortbar button{border:1px solid var(--line);background:var(--card);color:var(--sub);border-radius:999px;padding:5px 12px;font-size:12px;font-weight:600}
.sortbar button.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.rgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}
@media(max-width:720px){.rgrid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:460px){.rgrid{grid-template-columns:1fr}}
.rcard{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--card);display:flex;flex-direction:column}
.rcard.nodata{opacity:.62}
.rank{position:absolute;top:6px;left:6px;background:#000000a8;color:#fff;font-size:11px;font-weight:800;border-radius:8px;padding:1px 7px}
.rthumb{position:relative;width:100%;aspect-ratio:1/1;background:#0a0f1e;display:flex;overflow:hidden}
.rthumb img{width:100%;height:100%;object-fit:cover;flex:1 1 0;min-width:0;border-right:1px solid #0a0f1e}
.rthumb img:last-child{border-right:0}
.rthumb .new{position:absolute;top:6px;right:6px;background:#ef4444;color:#fff;font-size:10px;font-weight:800;border-radius:8px;padding:1px 7px}
.rbody{padding:9px 11px 11px}
.rbody .th{font-size:13.5px;font-weight:800;line-height:1.35;margin-bottom:3px}
.rbody .mp{font-size:11px;color:var(--sub);margin-bottom:7px}
.rbody .mp b{color:var(--txt)}
.rmetrics{display:flex;gap:6px;flex-wrap:wrap}
.rmetrics .mx{flex:1 1 0;min-width:56px;background:var(--card2);border:1px solid var(--line);border-radius:9px;padding:5px 7px;text-align:center}
.rmetrics .mx .v{font-size:16px;font-weight:800}.rmetrics .mx .k{font-size:10px;color:var(--sub)}
.rmetrics .mx.lead .v{color:#86efac}.rmetrics .mx.cpl .v{color:#fdba74}.rmetrics .mx.ctr .v{color:#7dd3fc}
.rtag{font-size:10.5px;padding:2px 7px;border-radius:999px;margin-top:8px;display:inline-block}
.rtag.act{background:#123322;color:#86efac}.rtag.pau{background:#20263a;color:#96a0bd}.rtag.non{background:#2a1418;color:#fca5a5}
</style></head><body><div class="wrap">
<h1>廣告 OKR 監控台 · 閱讀 / 英語</h1>
<div class="meta">篩選 campaign／廣告名含「Rose」· 主數字＝Ads Manager 成果(meta)，括號為後端領課 · 每天 09:00（台北）自動更新</div>
<div id="alerts"></div>

<div class="sec-t">① 季度 / 當月 OKR 進度</div>
<div id="okr" class="okr"></div>
<div class="note">進度＝累計領課 ÷ 目標；<b>白線＝時間進度</b>（已過天數÷總天數）。進度在白線左邊＝落後，差距即缺口。推估＝累計 ÷ 時間進度。Q3 累計自 7/1 起持續疊加。</div>

<div class="sec-t">② 近${RECENT_DAYS}天上架廣告分析（視覺・投放主・成效）</div>
<div id="recentSum"></div>
<div class="sortbar">排序：<button data-k="m10" class="on">領課成果</button><button data-k="cpl">CPL（低→高）</button><button data-k="ctr7">CTR</button><button data-k="uploaded">上架日</button></div>
<div id="recentGrid" class="rgrid"></div>
<div class="note">視覺＝creative library 素材圖（同編號取 A/B）；投放主＝發佈粉專；上架日＝素材上傳日。<b>領課/CPL＝近${RECENT_DAYS}天</b>（帳本 meta 成果），<b>CTR＝近7日</b>（adset 口徑，無每日點擊資料）。剛上架者可能只有 CTR 尚無領課，屬正常早期訊號。灰底＝已上傳但目前無投放成效數據。</div>

<div class="sec-t">③ 每週追蹤（閱讀・以週為單位）</div>
<div id="weekSum"></div>
<div class="chartbox"><h3>每週領課 vs 合格線（Mon–Sun）</h3><canvas id="wkchart" height="200"></canvas></div>
<div id="weekTable"></div>
<div class="note">單週合格線＝當月目標 ÷ 4（7月 950/4≈<b>238</b>、8月 1160/4=290、9月 1250/4≈313）。跨月週按週結束日所屬月計。本週未結束僅供參考。</div>

<div class="sec-t">④ 每月缺口</div>
<div id="monthTable"></div>

<div class="sec-t">⑤ 廣告成效排行 + 迭代建議（本季累計）</div>
<div id="reco"></div>
<nav class="tabs" id="blTabs"></nav>
<div id="adTable"></div>

<div class="sec-t">⑥ 依 Campaign 匯總</div>
<div id="campTable"></div>

<div class="foot">Rose Rose 行銷部 · 廣告投放 OKR 監控<br>資料源 Arkio Ad Pilot dashboard · 最後更新 <span id="ls"></span></div>
</div>
<script>
const D = ${st};
document.getElementById('ls').textContent = D.genStamp + '（台北）';
const $ = id => document.getElementById(id);
const stName = {behind:'🔴 落後',watch:'🟡 留意',ahead:'🟢 達標',na:'—',pass:'🟢 合格',fail:'🔴 未達',current:'⏳ 進行中',scale:'🔥 加碼',iterate:'🔧 迭代',keep:'✅ 維持',testing:'🧪 測試',paused:'⏸ 暫停',reactivate:'⏸ 可重啟'};

// 警示條
let al='';
if(D.fetchStatus==='stale'||D.fetchStatus==='error') al+='<div class="stale">⚠ 本次未能連上 Arkio（'+D.fetchStatus+'），顯示的是帳本既有資料，可能非最新。請檢查 ARKIO_TOKEN。</div>';
if(D.expDate){ const days=Math.round((Date.parse(D.expDate)-Date.parse(D.today))/86400000); if(days<=21) al+='<div class="warnbar">🔑 Arkio 憑證將於 <b>'+D.expDate+'</b> 到期（約 '+days+' 天）。到期前請重新登入 arkio.me 取新 JWT，更新本機 .arkio_token 與 GitHub secret <b>ARKIO_TOKEN</b>，否則自動更新會停擺。</div>'; }
$('alerts').innerHTML=al;

// ① OKR 卡
const okr=$('okr');
D.subjects.forEach(s=>{
  [{scope:'Q3 季累計',o:s.q3,tp:s.q3.timeProg,extra:'第'+D.dayOfQuarter+'/'+D.quarter.totalDays+'天'},
   {scope:D.curYM+' 當月',o:s.cur,tp:s.cur.timeProg,extra:D.dayOfMonth+'/'+D.dim+'天',isMonth:true}].forEach(seg=>{
    if(s.key==='en'&&seg.isMonth) return; // 英語僅顯示季累計(目標待確認)，不做當月判定
    const o=seg.o;
    // 參考科目(英語)：只顯示追蹤數量＋參考目標，不做超前/落後判定，避免誤導
    if(s.ref){
      const div=document.createElement('div'); div.className='ocard na';
      div.innerHTML=
        '<div class="hd"><div class="nm">'+s.name+' <span class="pill">'+seg.scope+' · 追蹤</span></div></div>'+
        '<div class="big">'+o.actual+'<small> 領課（後端 '+o.actualBk+'）</small></div>'+
        '<div class="row2"><span class="chip">參考目標 '+(o.target||'—')+'（待 Rose 確認月/季）</span><span class="chip">近7日均 '+D.subjects[1].cur.recent7Rate+'</span></div>';
      okr.appendChild(div); return;
    }
    const cls=o.status||'na';
    const prog=o.prog||0, tp=seg.tp||0;
    const barCol=cls==='behind'?'var(--warn)':cls==='watch'?'var(--watch)':cls==='ahead'?'var(--good)':'var(--sub)';
    const dtxt=o.target? (o.diff>=0?'🟢 超前 '+o.diff.toFixed(1)+'pt':'🔴 落後 '+Math.abs(o.diff).toFixed(1)+'pt') : '';
    const div=document.createElement('div'); div.className='ocard '+cls;
    div.innerHTML=
      '<div class="hd"><div class="nm">'+s.name+' <span class="pill">'+seg.scope+'</span></div><div class="df '+(o.diff>=0?'pos':'neg')+'">'+dtxt+'</div></div>'+
      '<div class="big">'+o.actual+'<small> / '+(o.target||'—')+' 領課'+(o.target?'　('+prog.toFixed(1)+'%)':'')+'</small></div>'+
      (o.target?('<div class="dualbar"><div class="lab"><span>進度 '+prog.toFixed(1)+'%</span><span>時間 '+tp.toFixed(1)+'% ('+seg.extra+')</span></div>'+
      '<div class="track"><i style="width:'+Math.min(100,prog)+'%;background:'+barCol+'"></i><span class="tick" style="left:'+Math.min(100,tp)+'%"></span></div></div>'):'')+
      '<div class="row2">'+
        (o.target?'<span class="chip">推估'+(seg.isMonth?'月底':'季末')+' <b>'+o.proj+'</b>（達成 '+o.attain.toFixed(0)+'%）</span>':'')+
        (o.target&&o.gap>0?'<span class="chip neg">預估缺口 <b>'+o.gap+'</b></span>':(o.target?'<span class="chip pos">預估達標 ✓</span>':''))+
        (seg.isMonth&&o.target?'<span class="chip">尚缺 <b>'+o.remain+'</b>／需日均 <b>'+o.needPerDay+'</b>（近7日均 '+o.recent7Rate+'）</span>':'')+
        '<span class="chip">後端 '+o.actualBk+'</span>'+
      '</div>';
    okr.appendChild(div);
  });
});

// ② 近N天上架廣告分析
const RA=D.recentAds;
const withPerf=RA.items.filter(x=>x.hasPerf);
const totLead=withPerf.reduce((s,x)=>s+(x.m10||0),0);
const activeN=RA.items.filter(x=>x.status&&!/PAUSED/i.test(x.status)).length;
$('recentSum').innerHTML='<div class="summary '+(totLead>0?'green':'')+'"><div class="hd">🆕 近'+RA.days+'天上架 '+RA.items.length+' 檔廣告（上架日 ≥ '+RA.cutoff+'）</div>'+
  '<div>其中 '+activeN+' 檔投放中，近'+RA.days+'天合計貢獻領課 <b>'+totLead+'</b>。剛上架者多半只有 CTR、尚無領課，看 CTR 找有潛力的續投；已有領課且 CPL 低者可加碼。</div></div>';
const grid=$('recentGrid');
function pageLine(x){ return x.pages.map(p=>p.name).join('／')||'—'; }
function renderRecent(sortKey){
  const items=[...RA.items];
  const val=(x,k)=> k==='cpl' ? (x.cpl==null?Infinity:x.cpl) : k==='uploaded' ? (x.uploaded||'') : (x[k]==null?-1:x[k]);
  items.sort((a,b)=>{ if(sortKey==='cpl'){return val(a,'cpl')-val(b,'cpl');} if(sortKey==='uploaded'){return val(b,'uploaded')<val(a,'uploaded')?-1:1;} return val(b,sortKey)-val(a,sortKey); });
  grid.innerHTML='';
  items.forEach((x,i)=>{
    const isNew=x.uploaded>=D.recentAds.cutoff && (x.m10==null||x.m10===0);
    const tagCls=!x.hasPerf?'non':(x.status&&/PAUSED/i.test(x.status)?'pau':'act');
    const tagTxt=!x.hasPerf?'無投放成效':(x.status&&/PAUSED/i.test(x.status)?'已暫停':'投放中');
    const imgs=(x.imgs.length?x.imgs:['']).slice(0,2).map(u=>u?'<img loading="lazy" src="'+u+'" alt="">':'<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--sub);font-size:11px">無圖</div>').join('');
    const c=document.createElement('div'); c.className='rcard'+(x.hasPerf?'':' nodata');
    c.innerHTML=
      '<div class="rthumb"><span class="rank">#'+(i+1)+'</span>'+imgs+(x.uploaded?'<span class="new">'+x.uploaded.slice(5)+' 上架</span>':'')+'</div>'+
      '<div class="rbody">'+
        '<div class="th">'+x.theme+' <span class="pill">'+(x.bl==='English'?'英':'閱')+'</span></div>'+
        '<div class="mp">投放主 <b>'+pageLine(x)+'</b>　·　#'+x.num+'</div>'+
        '<div class="rmetrics">'+
          '<div class="mx lead"><div class="v">'+(x.m10==null?'—':x.m10)+'</div><div class="k">近'+RA.days+'天領課</div></div>'+
          '<div class="mx cpl"><div class="v">'+(x.cpl==null?'—':'$'+x.cpl)+'</div><div class="k">CPL</div></div>'+
          '<div class="mx ctr"><div class="v">'+(x.ctr7==null?'—':x.ctr7+'%')+'</div><div class="k">CTR·7日</div></div>'+
        '</div>'+
        '<span class="rtag '+tagCls+'">'+tagTxt+'</span>'+
      '</div>';
    grid.appendChild(c);
  });
}
document.querySelectorAll('.sortbar button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.sortbar button').forEach(x=>x.classList.remove('on'));b.classList.add('on');renderRecent(b.dataset.k);});
renderRecent('m10');

// ③ 每週
const wk=D.subjects[0].weeks;
const cur=D.subjects[0].cur;
const passed=wk.filter(w=>w.status==='pass').length, failed=wk.filter(w=>w.status==='fail').length;
let ws='<div class="summary '+(failed>passed?'red':'green')+'"><div class="hd">'+
  (cur.status==='behind'?'🔴 本月落後合格線':cur.status==='watch'?'🟡 貼著合格線':'🟢 合格線內')+
  '　·　已結束週 '+passed+' 合格／'+failed+' 未達</div>'+
  '<div>本週(進行中) '+wk[wk.length-1].actual+'／合格線 '+wk[wk.length-1].line+'，'+(wk[wk.length-1].gap>0?'還差 <b class="neg">'+wk[wk.length-1].gap+'</b>':'已達標 ✓')+'。近7日均 <b>'+cur.recent7Rate+'</b>／需日均 <b>'+cur.needPerDay+'</b>。</div></div>';
$('weekSum').innerHTML=ws;
let wt='<div class="tablewrap"><table><thead><tr><th>週(Mon–Sun)</th><th>領課(成果)</th><th>後端</th><th>合格線</th><th>缺口</th><th>狀態</th></tr></thead><tbody>';
wk.forEach(w=>{ wt+='<tr><td>'+w.start.slice(5)+'~'+w.end.slice(5)+(w.isCur?' ⏳':'')+'</td><td><b>'+w.actual+'</b></td><td>'+w.actualBk+'</td><td>'+(w.line??'—')+'</td><td>'+(w.gap>0?'<span class="neg">-'+w.gap+'</span>':(w.line?'<span class="pos">✓</span>':'—'))+'</td><td><span class="st '+w.status+'">'+stName[w.status]+'</span></td></tr>'; });
wt+='</tbody></table></div>'; $('weekTable').innerHTML=wt;

// ③ 每月
function monthTbl(){
  let h='<div class="tablewrap"><table><thead><tr><th>月份</th><th>領課(成果)</th><th>後端</th><th>目標</th><th>時間%</th><th>推估月底</th><th>缺口</th><th>狀態</th></tr></thead><tbody>';
  D.subjects.forEach(s=>{ s.months.forEach(m=>{ if(s.key==='en'&&m.target==null) return;
    h+='<tr><td>'+s.name+' '+m.ym.slice(5)+'</td><td><b>'+m.actual+'</b></td><td>'+m.actualBk+'</td><td>'+(m.target??'—')+'</td><td>'+(m.isCur?m.timeProg.toFixed(0)+'%':(m.isPast?'100%':'—'))+'</td><td>'+(m.target?m.proj:'—')+'</td><td>'+(m.gap>0?'<span class="neg">-'+m.gap+'</span>':(m.target?'<span class="pos">✓</span>':'—'))+'</td><td><span class="st '+m.status+'">'+stName[m.status]+'</span></td></tr>';
  });});
  h+='</tbody></table></div>'; return h;
}
$('monthTable').innerHTML=monthTbl();

// ④ 建議
const A=D.advice;
let rc='<div class="summary '+(A.safe?'green':'red')+'"><div class="hd">'+(A.safe?'🟢 目前安全，維持現有投放即可':'🔴 需補量：預估月底缺口 '+(cur.gap||0)+' 人')+'</div>';
if(!A.safe){
  rc+='<div>當月尚缺 <b>'+cur.remain+'</b> 人，剩餘天數需日均 <b>'+cur.needPerDay+'</b>（近7日均僅 <b>'+cur.recent7Rate+'</b>）。';
  if(A.adsNeeded) rc+='每日缺口約 <b class="neg">'+A.addlPerDay+'</b> 人 → 以現有最強廣告日均 '+A.winnerDaily+' 估，需 <b>加碼現有爆款</b> 或再上 <b>約 '+A.adsNeeded+' 檔</b>同級新廣告。';
  rc+='</div>';
}
if(A.topScale.length){ rc+='<div style="margin-top:6px">🔥 <b>建議加碼（爆款）</b>：<ul>'; A.topScale.forEach(r=>{ rc+='<li>'+r.name+'（成果 '+r.m+'、CPL $'+r.cpl+(r.suggestedBudget?'，建議日預算 →$'+r.suggestedBudget:'')+'）'+(r.adviceText?'　<span class="sub">'+r.adviceText+'</span>':'')+'</li>'; }); rc+='</ul></div>'; }
if(A.iterate.length){ rc+='<div style="margin-top:4px">🔧 <b>建議迭代／重啟</b>：<ul>'; A.iterate.forEach(r=>{ rc+='<li>'+r.name+'（成果 '+r.m+'、CPL '+(r.cpl!=null?'$'+r.cpl:'—')+'）'+(r.declineType?'　衰退:'+r.declineType:'')+(r.paused?'　已暫停':'')+'</li>'; }); rc+='</ul></div>'; }
if(A.bestByCpl.length){ rc+='<div style="margin-top:4px">💰 <b>CPL 最優（成本效率）</b>：'+A.bestByCpl.map(r=>r.name.replace(/^\\d+\\s*/,'')+' $'+r.cpl).join('、')+'</div>'; }
rc+='</div>'; $('reco').innerHTML=rc;

// 廣告表（分業務線 tab）
const bls=[...new Set(D.rows.map(r=>r.bl))];
const tabsEl=$('blTabs'); let curBL=bls[0];
function renderAds(){
  const rr=D.rows.filter(r=>r.bl===curBL);
  let h='<div class="tablewrap"><table><thead><tr><th>廣告</th><th>成果</th><th>後端</th><th>花費$</th><th>CPL</th><th>近7日</th><th>日預算</th><th>分類</th><th>系統建議</th></tr></thead><tbody>';
  rr.forEach(r=>{ h+='<tr><td><span class="chan-name"><span class="dot" style="background:'+r.color+'"></span>'+r.name+'</span></td>'+
    '<td><b>'+r.m+'</b></td><td>'+r.b+'</td><td>'+r.spend+'</td><td>'+(r.cpl!=null?'$'+r.cpl:'—')+'</td><td>'+r.m7+'</td><td>'+(r.budget??'—')+'</td>'+
    '<td><span class="st '+r.tag+'">'+r.tagTxt+'</span></td><td style="text-align:left;white-space:normal;max-width:230px;color:var(--sub)">'+(r.adviceText||'')+'</td></tr>'; });
  h+='</tbody></table></div>'; $('adTable').innerHTML=h;
}
bls.forEach((bl,i)=>{ const b=document.createElement('button'); b.textContent=(bl==='Reading'?'閱讀':bl==='English'?'英語':bl)+'（'+D.rows.filter(r=>r.bl===bl).length+'）'; b.className=i===0?'on':''; b.onclick=()=>{curBL=bl;[...tabsEl.children].forEach(c=>c.classList.remove('on'));b.classList.add('on');renderAds();}; tabsEl.appendChild(b); });
renderAds();

// ⑤ campaign
const camps={};
D.rows.forEach(r=>{ (camps[r.campaign]??={name:r.campaign,bl:r.bl,m:0,b:0,spend:0,n:0}); camps[r.campaign].m+=r.m; camps[r.campaign].b+=r.b; camps[r.campaign].spend+=r.spend; camps[r.campaign].n++; });
let ct='<div class="tablewrap"><table><thead><tr><th>Campaign</th><th>線</th><th>成果</th><th>後端</th><th>花費$</th><th>CPL</th><th>廣告數</th></tr></thead><tbody>';
Object.values(camps).sort((a,b)=>b.m-a.m).forEach(c=>{ ct+='<tr><td>'+c.name+'</td><td>'+(c.bl==='Reading'?'閱':'英')+'</td><td><b>'+c.m+'</b></td><td>'+c.b+'</td><td>'+c.spend+'</td><td>'+(c.m>0?'$'+(c.spend/c.m).toFixed(1):'—')+'</td><td>'+c.n+'</td></tr>'; });
ct+='</tbody></table></div>'; $('campTable').innerHTML=ct;

// 每週圖
const labels=wk.map(w=>w.start.slice(5));
new Chart($('wkchart'),{type:'bar',
  data:{labels,datasets:[
    {label:'週領課(成果)',data:wk.map(w=>w.actual),backgroundColor:wk.map(w=>w.status==='fail'?'#ef4444':w.status==='pass'?'#22c55e':'#f59e0b'),borderWidth:0},
    {label:'合格線',type:'line',data:wk.map(w=>w.line),borderColor:'#e8ecf6',borderDash:[5,4],pointRadius:0,borderWidth:1.5}
  ]},
  options:{responsive:true,maintainAspectRatio:true,plugins:{legend:{labels:{color:'#96a0bd',font:{size:10}}}},
    scales:{x:{ticks:{color:'#96a0bd',font:{size:9}},grid:{display:false}},y:{ticks:{color:'#96a0bd',font:{size:9}},grid:{color:'#2a3450'}}}}});
</script></body></html>`;
}
