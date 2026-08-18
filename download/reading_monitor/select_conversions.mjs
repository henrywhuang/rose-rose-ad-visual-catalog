// Build the Arkio-verified purchase conversion module.
// Purchase attribution comes from the "訂閱" field on Arkio's ad-budget
// dashboard (h5_funnel.subs_total). The dashboard exposes that field as a
// current cumulative value, not a date-series, so the three-month boundary is
// applied to Meta activity: only ad sets with a real lead in the window remain.
// Arkio exposes this at ad-set level, so multi-creative ad sets use the
// highest-lead creative as the representative visual and keep an attribution note.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '..', '..', '..');
const TOKEN_PATH = path.join(ROOT, '.arkio_token');
const CACHE_DIR = path.join(__dir, '.image_cache');
const ASSET_DIR = path.join(__dir, 'assets');
const OUTPUT_PATH = path.join(__dir, 'conversion_data.json');
const API = 'https://www.arkio.me/api/v1';
const dateInShanghai = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const subtractCalendarMonths = (date, months) => {
  const value = new Date(`${date}T00:00:00Z`);
  const day = value.getUTCDate();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() - months);
  const endOfTargetMonth = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
  value.setUTCDate(Math.min(day, endOfTargetMonth));
  return value.toISOString().slice(0, 10);
};
const DATE_TO = process.env.DATE_TO || dateInShanghai;
const DATE_FROM = process.env.DATE_FROM || subtractCalendarMonths(DATE_TO, 3);

fs.mkdirSync(CACHE_DIR, { recursive: true });
fs.mkdirSync(ASSET_DIR, { recursive: true });

const token = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

const DISPLAY_OVERRIDES = {
  '526323183897076': '育兒小百科',
  '136787099518614': '輕鬆學國英數',
  '448515961688859': '繪本福利社',
  '518977501296228': '親子愛共讀',
  '100918212446595': 'JoJo閱讀',
  '470378269499737': 'Claire國小數學',
};
const CONVERSION_ROUTES = new Set(['tw_reading_h5', 'tw_math_h5']);

async function get(endpoint, timeoutMs = 60000) {
  const response = await fetch(API + endpoint, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
  return JSON.parse(text);
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(value, digits = 2) {
  return value == null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));
}

function leadOf(insight) {
  return num((insight?.actions || []).find(a => a.action_type === 'initiate_checkout')?.value);
}

function visualKey(creative) {
  const spec = creative?.object_story_spec || {};
  return spec.link_data?.image_hash ||
    spec.photo_data?.image_hash ||
    spec.video_data?.image_hash ||
    creative?.effective_object_story_id ||
    creative?.id;
}

function pageIdOf(creative) {
  return String(creative?.object_story_spec?.page_id || '');
}

function inferOwner(...values) {
  const text = values.filter(Boolean).join(' ');
  if (/jo\s*math|jojo數學/i.test(text)) return 'JoJo數學';
  if (/輕鬆學|easylearning/i.test(text)) return '輕鬆學國英數';
  if (/育兒小百科|小百科|child_wiki/i.test(text)) return '育兒小百科';
  if (/繪本福利社|little_pages/i.test(text)) return '繪本福利社';
  if (/親子愛共讀|愛共讀|parent_reading/i.test(text)) return '親子愛共讀';
  if (/jojo閱讀|jojoreading/i.test(text)) return 'JoJo閱讀';
  if (/claire/i.test(text)) return 'Claire國小數學';
  return '';
}

function bestName(name, adsetName) {
  return /^(?:ad\s*\d+|\d+)$/i.test(String(name || '').trim())
    ? adsetName || name
    : name || adsetName || '未命名購課廣告';
}

function textAssets(creative) {
  const feed = creative?.asset_feed_spec || {};
  const headlines = [...new Set((feed.titles || []).map(x => String(x?.text || '').trim()).filter(Boolean))];
  const bodies = [...new Set((feed.bodies || []).map(x => String(x?.text || '').trim()).filter(Boolean))];
  return { headlines, bodies };
}

async function download(url) {
  if (!url) throw new Error('empty image URL');
  const key = crypto.createHash('sha256').update(url).digest('hex');
  const file = path.join(CACHE_DIR, key);
  if (fs.existsSync(file) && fs.statSync(file).size > 100) return file;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 creative-monitor/1.0' },
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`image HTTP ${response.status}`);
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  return file;
}

function fingerprint(file) {
  const result = spawnSync('ffmpeg', [
    '-v', 'error', '-i', file,
    '-vf', 'scale=32:32:flags=lanczos,format=gray',
    '-f', 'rawvideo', '-',
  ], { encoding: null, maxBuffer: 2 * 1024 * 1024 });
  if (result.status !== 0 || result.stdout.length < 1024) throw new Error('ffmpeg fingerprint failed');
  const px = result.stdout;
  const coeff = [];
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let sum = 0;
      for (let x = 0; x < 32; x++) {
        const cx = Math.cos(((2 * x + 1) * u * Math.PI) / 64);
        for (let y = 0; y < 32; y++) {
          sum += px[y * 32 + x] * cx * Math.cos(((2 * y + 1) * v * Math.PI) / 64);
        }
      }
      coeff.push(sum);
    }
  }
  const sorted = coeff.slice(1).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  let phash = 0n;
  for (const value of coeff) phash = (phash << 1n) | (value > median ? 1n : 0n);
  let dhash = 0n;
  for (let y = 0; y < 8; y++) {
    const py = Math.min(31, y * 4 + 2);
    for (let x = 0; x < 8; x++) {
      const left = px[py * 32 + Math.min(31, x * 4 + 1)];
      const right = px[py * 32 + Math.min(31, x * 4 + 5)];
      dhash = (dhash << 1n) | (left > right ? 1n : 0n);
    }
  }
  return {
    exact: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    phash,
    dhash,
  };
}

function popcount(value) {
  let n = value;
  let count = 0;
  while (n) { count++; n &= n - 1n; }
  return count;
}

function sameVisual(a, b) {
  if (a.exact === b.exact) return true;
  return popcount(a.phash ^ b.phash) <= 6 && popcount(a.dhash ^ b.dhash) <= 10;
}

const dashboard = (await get('/ad-budget/dashboard')).data;
const convertedAdsets = (dashboard.adsets || [])
  .filter(row => CONVERSION_ROUTES.has(row.route_key) && (row.h5_funnel?.subs_total || 0) > 0)
  .sort((a, b) => b.h5_funnel.subs_total - a.h5_funnel.subs_total);

const fields = [
  'name', 'status', 'effective_status', 'created_time',
  `ads.limit(50){id,name,status,effective_status,created_time,creative{id,name,image_url,thumbnail_url,object_story_spec,asset_feed_spec,effective_object_story_id},insights.time_range({since:"${DATE_FROM}",until:"${DATE_TO}"}).limit(100){spend,impressions,clicks,ctr,actions}}`,
].join(',');

const candidates = [];
for (const adset of convertedAdsets) {
  const query = new URLSearchParams({ fields });
  const payload = await get(`/meta/ads/adset/${encodeURIComponent(adset.meta_adset_id || adset.id)}?${query}`);
  const visualRows = [];
  for (const ad of payload?.ads?.data || []) {
    const creative = ad.creative || {};
    const key = visualKey(creative);
    const imageUrl = creative.image_url || creative.thumbnail_url || '';
    if (!key || !imageUrl) continue;
    const insights = ad.insights?.data || [];
    const totals = insights.reduce((out, row) => {
      out.leads += leadOf(row);
      out.spend += num(row.spend);
      out.impressions += num(row.impressions);
      out.clicks += num(row.clicks);
      return out;
    }, { leads: 0, spend: 0, impressions: 0, clicks: 0 });
    const text = textAssets(creative);
    visualRows.push({
      adId: ad.id,
      name: ad.name || creative.name || adset.name,
      imageUrl,
      visualKey: String(key),
      pageId: pageIdOf(creative),
      owner: DISPLAY_OVERRIDES[pageIdOf(creative)] ||
        inferOwner(ad.name, creative.name, adset.name, adset.campaign_name) ||
        adset.route_key || adset.account || '未辨識投放主',
      headlines: text.headlines,
      bodies: text.bodies,
      ...totals,
      ctr: totals.impressions > 0 ? round(totals.clicks / totals.impressions * 100) : null,
      cpl: totals.leads > 0 ? round(totals.spend / totals.leads) : null,
    });
  }
  if (!visualRows.length) continue;
  visualRows.sort((a, b) => b.leads - a.leads || (b.ctr ?? -1) - (a.ctr ?? -1));
  const representative = visualRows[0];
  // A cumulative Arkio subscription alone is not enough for this module: the
  // ad set must also have attracted at least one Meta lead in the 3-month window.
  if (representative.leads <= 0) continue;
  try {
    const cacheFile = await download(representative.imageUrl);
    candidates.push({
      ...representative,
      cacheFile,
      fingerprint: fingerprint(cacheFile),
      adsetId: String(adset.meta_adset_id || adset.id),
      adsetName: adset.name,
      campaignName: adset.campaign_name,
      status: adset.status,
      routeKey: adset.route_key,
      purchases: num(adset.h5_funnel.subs_total),
      arkioLeads: num(adset.h5_funnel.leads_total),
      registrations: num(adset.h5_funnel.regs_total),
      diagnoses: num(adset.h5_funnel.diags_total),
      creativeVariants: new Set(visualRows.map(row => row.visualKey)).size,
      adIds: visualRows.map(row => row.adId).filter(Boolean),
      owners: [...new Set(visualRows.map(row => row.owner).filter(Boolean))],
    });
  } catch (error) {
    console.error(`skip converted adset ${adset.id}: ${error.message}`);
  }
}

const clusters = [];
for (const row of candidates) {
  const cluster = clusters.find(item => sameVisual(item.fingerprint, row.fingerprint));
  if (cluster) cluster.members.push(row);
  else clusters.push({ fingerprint: row.fingerprint, members: [row] });
}

const merged = clusters.map(cluster => {
  const members = cluster.members;
  const representative = [...members].sort((a, b) => b.leads - a.leads || (b.ctr ?? -1) - (a.ctr ?? -1))[0];
  const purchases = members.reduce((sum, row) => sum + row.purchases, 0);
  const arkioLeads = members.reduce((sum, row) => sum + row.arkioLeads, 0);
  const spend = members.reduce((sum, row) => sum + row.spend, 0);
  const impressions = members.reduce((sum, row) => sum + row.impressions, 0);
  const clicks = members.reduce((sum, row) => sum + row.clicks, 0);
  const metaLeads = members.reduce((sum, row) => sum + row.leads, 0);
  return {
    fingerprint: cluster.fingerprint,
    cacheFile: representative.cacheFile,
    name: bestName(representative.name, representative.adsetName),
    adsetNames: [...new Set(members.map(row => row.adsetName).filter(Boolean))],
    adsetIds: [...new Set(members.map(row => row.adsetId))],
    owners: [...new Set(members.flatMap(row => row.owners || [row.owner]).filter(Boolean))],
    owner: [...new Set(members.flatMap(row => row.owners || [row.owner]).filter(Boolean))].join('＋'),
    routeKeys: [...new Set(members.map(row => row.routeKey).filter(Boolean))],
    purchases,
    arkioLeads,
    conversionRate: arkioLeads > 0 ? round(purchases / arkioLeads * 100) : null,
    metaLeads,
    spend: round(spend),
    cpl: metaLeads > 0 ? round(spend / metaLeads) : null,
    ctr: impressions > 0 ? round(clicks / impressions * 100) : null,
    impressions,
    clicks,
    creativeVariants: members.reduce((sum, row) => sum + row.creativeVariants, 0),
    convertedAdsets: members.length,
    headlines: [...new Set(members.flatMap(row => row.headlines || []))].slice(0, 5),
    bodies: [...new Set(members.flatMap(row => row.bodies || []))].slice(0, 2),
  };
}).sort((a, b) =>
  b.purchases - a.purchases ||
  (b.conversionRate ?? -1) - (a.conversionRate ?? -1) ||
  b.arkioLeads - a.arkioLeads
);

const output = [];
for (let i = 0; i < merged.length; i++) {
  const row = merged[i];
  const filename = `conversion_${String(i + 1).padStart(2, '0')}.jpg`;
  const target = path.join(ASSET_DIR, filename);
  const converted = spawnSync('ffmpeg', [
    '-y', '-v', 'error', '-i', row.cacheFile,
    '-vf', 'scale=1200:-2:flags=lanczos',
    '-frames:v', '1', '-q:v', '3', target,
  ], { encoding: 'utf8' });
  if (converted.status !== 0) throw new Error(`asset conversion failed: ${row.name}`);
  delete row.fingerprint;
  delete row.cacheFile;
  output.push({
    ...row,
    rank: i + 1,
    image: `assets/${filename}`,
    metaWindowFrom: DATE_FROM,
    metaWindowTo: DATE_TO,
    arkioUpdatedAt: dashboard.last_updated || null,
    attribution: 'Arkio 投放調控「訂閱」（廣告組層級累計）',
    qualification: `Meta ${DATE_FROM}～${DATE_TO} 有實際領課`,
    sourceUrl: 'https://www.arkio.me/marketing/ad-budget',
  });
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
console.log(JSON.stringify({
  arkio_updated_at: dashboard.last_updated,
  converted_adsets: candidates.length,
  purchase_total: candidates.reduce((sum, row) => sum + row.purchases, 0),
  representative_visuals: candidates.length,
  unique_visuals: output.length,
  output_purchase_total: output.reduce((sum, row) => sum + row.purchases, 0),
  rows: output.map(row => ({
    rank: row.rank,
    name: row.name,
    owner: row.owner,
    purchases: row.purchases,
    arkioLeads: row.arkioLeads,
    conversionRate: row.conversionRate,
    creativeVariants: row.creativeVariants,
  })),
}, null, 2));
