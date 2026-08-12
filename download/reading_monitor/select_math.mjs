// Perceptually dedupe Taiwan math ads, merge city/relaunch variants, and output
// the top 20 visuals by two-month initiate_checkout count.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const candidates = JSON.parse(fs.readFileSync(path.join(__dir, 'math_candidates.json'), 'utf8'));
const raw = JSON.parse(fs.readFileSync(path.join(__dir, 'raw_2m.json'), 'utf8'));
const monitor = JSON.parse(fs.readFileSync(path.join(__dir, 'monitor_data.json'), 'utf8'));
const CACHE_DIR = path.join(__dir, '.image_cache');
const ASSET_DIR = path.join(__dir, 'assets');
fs.mkdirSync(CACHE_DIR, { recursive: true });
fs.mkdirSync(ASSET_DIR, { recursive: true });

async function download(url) {
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

const ready = [];
let index = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  for (;;) {
    const current = index++;
    if (current >= candidates.length) return;
    const row = candidates[current];
    try {
      row.cacheFile = await download(row.imageUrl);
      row.fingerprint = fingerprint(row.cacheFile);
      ready.push(row);
    } catch (error) {
      console.error(`skip image: ${row.name} | ${error.message}`);
    }
  }
}));

const clusters = [];
for (const row of ready.sort((a, b) => b.leads - a.leads)) {
  const existing = clusters.find(cluster => sameVisual(cluster.fingerprint, row.fingerprint));
  if (existing) existing.members.push(row);
  else clusters.push({ fingerprint: row.fingerprint, members: [row] });
}

const readingFingerprints = monitor.map(row =>
  fingerprint(path.join(__dir, row.image))
);

const CITY_RE = /(?:台北市|新北市|桃園市|台中市|台南市|高雄市|基隆市|新竹縣市|新竹市|新竹縣|嘉義縣市|彰化縣|屏東縣|宜蘭縣|花蓮縣|台東縣|苗栗縣|南投縣|雲林縣|澎湖縣|金門縣|連江縣)/g;
const cleanName = value => String(value || '')
  .replace(/\s+20\d{2}-\d{2}-\d{2}-[a-f0-9]{20,}$/i, '')
  .replace(/\s+/g, ' ')
  .trim();
const generic = /^(?:ad\s*\d+|\d+|廣告|素材)$/i;
const mathName = /(?:jomath|數學|算數|計算|加減|加法|減法|乘法|除法|九九|數感|應用題)/i;
function bestName(names) {
  return [...new Set(names.filter(Boolean))]
    .map(name => ({
      name: cleanName(name),
      score:
        (generic.test(cleanName(name)) ? -100 : 0) +
        (mathName.test(name) ? 25 : 0) +
        (/\b(?:2|3)[0-9]{4}\b/.test(name) ? 12 : 0) +
        Math.min(String(name).length, 80) / 10,
    }))
    .sort((a, b) => b.score - a.score)[0]?.name || '數學廣告';
}

const merged = clusters.map(cluster => {
  const members = cluster.members;
  const representative = [...members].sort((a, b) => b.leads - a.leads)[0];
  const leads = members.reduce((sum, row) => sum + row.leads, 0);
  const spend = members.reduce((sum, row) => sum + row.spend, 0);
  const impressions = members.reduce((sum, row) => sum + row.impressions, 0);
  const clicks = members.reduce((sum, row) => sum + row.clicks, 0);
  const accountTotals = {};
  for (const row of members) accountTotals[row.account] = (accountTotals[row.account] || 0) + row.leads;
  const accountBreakdown = Object.entries(accountTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([account, accountLeads]) => ({ account, leads: accountLeads }));
  const names = [...new Set(members.flatMap(row => row.names || [row.name]))];
  const cities = [...new Set(names.flatMap(name => name.match(CITY_RE) || []))];
  return {
    fingerprint: cluster.fingerprint,
    name: bestName(names),
    account: accountBreakdown.map(x => x.account).join('＋'),
    accountBreakdown,
    leads,
    spend: Number(spend.toFixed(2)),
    cpl: leads > 0 ? Number((spend / leads).toFixed(2)) : null,
    ctr: impressions > 0 ? Number((clicks / impressions * 100).toFixed(2)) : null,
    impressions,
    clicks,
    variants: members.reduce((sum, row) => sum + Math.max(row.adsetIds?.length || 1, 1), 0),
    cities,
    headlines: [...new Set(members.flatMap(row => row.headlines || []))],
    bodies: [...new Set(members.flatMap(row => row.bodies || []))],
    cacheFile: representative.cacheFile,
    imageUrl: representative.imageUrl,
  };
}).sort((a, b) =>
  b.leads - a.leads ||
  (b.ctr ?? -1) - (a.ctr ?? -1) ||
  (a.cpl ?? Number.POSITIVE_INFINITY) - (b.cpl ?? Number.POSITIVE_INFINITY)
);

const mathOnly = merged.filter(row =>
  !readingFingerprints.some(reading => sameVisual(reading, row.fingerprint))
);
if (mathOnly.length < 20) throw new Error(`only ${mathOnly.length} math visuals remain after dashboard-wide dedupe`);
const top20 = mathOnly.slice(0, 20);
for (let i = 0; i < top20.length; i++) {
  const row = top20[i];
  const filename = `math_${String(i + 1).padStart(2, '0')}.jpg`;
  const output = path.join(ASSET_DIR, filename);
  const result = spawnSync('ffmpeg', [
    '-y', '-v', 'error', '-i', row.cacheFile,
    '-vf', 'scale=1200:-2:flags=lanczos',
    '-frames:v', '1', '-q:v', '3', output,
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`convert failed: ${row.name}`);
  delete row.cacheFile;
  delete row.imageUrl;
  delete row.fingerprint;
  row.rank = i + 1;
  row.image = `assets/${filename}`;
  row.windowFrom = raw.date_from;
  row.windowTo = raw.date_to;
  row.headlines = row.headlines.slice(0, 5);
  row.bodies = row.bodies.slice(0, 2);
}

fs.writeFileSync(path.join(__dir, 'math_data.json'), JSON.stringify(top20, null, 2));
console.log(JSON.stringify({
  candidates: candidates.length,
  fingerprints: ready.length,
  unique_visuals: merged.length,
  unique_after_reading_dedupe: mathOnly.length,
  top20_leads: top20.reduce((sum, row) => sum + row.leads, 0),
  top20: top20.map(row => ({
    rank: row.rank,
    name: row.name,
    account: row.account,
    leads: row.leads,
    ctr: row.ctr,
    cpl: row.cpl,
    variants: row.variants,
    cities: row.cities,
  })),
}, null, 2));
