// Fetch the latest two-month ad-level performance and creative payloads from Arkio.
// This is intentionally separate from build.mjs so the dashboard can be rebuilt
// without hitting Meta again. Node 18+; no third-party dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '..', '..', '..');
const TOKEN_PATH = path.join(ROOT, '.arkio_token');
const RAW_PATH = path.join(__dir, 'raw_2m.json');
const API = 'https://www.arkio.me/api/v1';
const ACCOUNT_ID = 'act_2336553763364202';
const DATE_FROM = process.env.DATE_FROM || '2026-05-24';
const DATE_TO = process.env.DATE_TO || '2026-07-23';
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || 8));

const token = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

async function get(endpoint, timeoutMs = 45000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const response = await fetch(API + endpoint, { headers, signal: ac.signal });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

function loadCache() {
  if (!fs.existsSync(RAW_PATH)) return { fetched_at: null, adsets: {}, failures: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(RAW_PATH, 'utf8'));
    if (parsed.date_from !== DATE_FROM || parsed.date_to !== DATE_TO) {
      return { fetched_at: null, adsets: {}, failures: {} };
    }
    return parsed;
  } catch {
    return { fetched_at: null, adsets: {}, failures: {} };
  }
}

function save(cache) {
  fs.writeFileSync(RAW_PATH, JSON.stringify(cache));
}

const adsetResponse = await get(`/marketing/ad-accounts/${ACCOUNT_ID}/adsets`);
const allAdsets = adsetResponse.data || [];
// Cover every adset launched during the two-month window plus older adsets that
// remain active (an older visual may still be continuously producing leads).
const scopedAdsets = allAdsets.filter(a =>
  String(a.created_time || '') >= DATE_FROM ||
  String(a.updated_time || '') >= DATE_FROM ||
  String(a.effective_status || '').toUpperCase() === 'ACTIVE'
);

const fields = [
  'name',
  'status',
  'effective_status',
  'created_time',
  'updated_time',
  `ads.limit(50){id,name,status,effective_status,created_time,creative{id,name,image_url,thumbnail_url,object_story_spec,asset_feed_spec,effective_object_story_id},insights.time_range({since:"${DATE_FROM}",until:"${DATE_TO}"}).time_increment(1).limit(100){date_start,date_stop,spend,impressions,clicks,ctr,actions}}`,
].join(',');

const cache = loadCache();
cache.date_from = DATE_FROM;
cache.date_to = DATE_TO;
cache.account_id = ACCOUNT_ID;
cache.adsets_total = allAdsets.length;
cache.adsets_scoped = scopedAdsets.length;
cache.adsets_meta = Object.fromEntries(scopedAdsets.map(a => [a.id, a]));

let done = 0;
let nextIndex = 0;
let lastSave = Date.now();

async function fetchOne(meta) {
  if (cache.adsets[meta.id]) return;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const query = new URLSearchParams({ fields });
      cache.adsets[meta.id] = await get(`/meta/ads/adset/${encodeURIComponent(meta.id)}?${query}`, 60000);
      delete cache.failures[meta.id];
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 750));
    }
  }
  cache.failures[meta.id] = String(lastError?.message || lastError);
}

async function worker() {
  for (;;) {
    const index = nextIndex++;
    if (index >= scopedAdsets.length) return;
    const meta = scopedAdsets[index];
    await fetchOne(meta);
    done++;
    if (done % 20 === 0 || Date.now() - lastSave > 15000) {
      cache.fetched_at = new Date().toISOString();
      save(cache);
      lastSave = Date.now();
      console.log(`progress ${done}/${scopedAdsets.length} | cached ${Object.keys(cache.adsets).length} | failures ${Object.keys(cache.failures).length}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
cache.fetched_at = new Date().toISOString();
save(cache);

const ads = Object.values(cache.adsets).reduce((sum, adset) => sum + (adset?.ads?.data?.length || 0), 0);
console.log(JSON.stringify({
  fetched_at: cache.fetched_at,
  window: `${DATE_FROM}..${DATE_TO}`,
  account_adsets: allAdsets.length,
  scoped_adsets: scopedAdsets.length,
  fetched_adsets: Object.keys(cache.adsets).length,
  ads,
  failures: Object.keys(cache.failures).length,
}, null, 2));
