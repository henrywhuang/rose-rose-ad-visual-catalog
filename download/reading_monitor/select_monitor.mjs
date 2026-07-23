// Select the final dashboard roster, perceptually dedupe visuals, download assets,
// and write monitor_data.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const candidates = JSON.parse(fs.readFileSync(path.join(__dir, 'candidates_2m.json'), 'utf8'));
const library = JSON.parse(fs.readFileSync(path.join(__dir, 'creative_library.json'), 'utf8'));
const CACHE_DIR = path.join(__dir, '.image_cache');
const ASSET_DIR = path.join(__dir, 'assets');
fs.mkdirSync(CACHE_DIR, { recursive: true });
fs.mkdirSync(ASSET_DIR, { recursive: true });

const ACCOUNT_ORDER = [
  { account: '親子愛共讀', code: 'parent_reading', slug: 'parent', target: 15 },
  { account: '育兒小百科', code: 'child_wiki', slug: 'wiki', target: 15 },
  { account: '輕鬆學國英數', code: 'easylearning_tw', slug: 'easy', target: 10 },
  { account: '繪本福利社', code: 'little_pages_club', slug: 'pages', target: 10 },
  { account: 'JoJo閱讀', code: 'jojoreading_tw', slug: 'jojo', target: 10 },
  { account: 'Emily', code: 'mommy_emilylee', slug: 'emily', target: 10 },
];

function round(n, digits = 2) {
  return n == null || !Number.isFinite(n) ? null : Number(n.toFixed(digits));
}

function parseJSON(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function bestName(names) {
  const list = [...new Set((names || []).filter(Boolean).map(s => String(s).trim()))];
  const generic = /^(?:ad\s*\d+|\d+|育兒小百科|愛共讀|親子愛共讀|輕鬆學|jojo閱讀)$/i;
  return list
    .map(name => ({
      name,
      score:
        (generic.test(name) ? -100 : 0) +
        (/\b(?:2|3)[0-9]{4}\b/.test(name) ? 20 : 0) +
        (/[（(](?:Rose|小百科|愛共讀|JOJO|繪本|輕鬆學)/i.test(name) ? 8 : 0) +
        Math.min(name.length, 60) / 10,
    }))
    .sort((a, b) => b.score - a.score)[0]?.name || list[0] || '未命名創意';
}

function cleanConcept(name) {
  return String(name || '')
    .replace(/\s+20\d{2}-\d{2}-\d{2}-[a-f0-9]{20,}$/i, '')
    .replace(/\s*[-–]\s*(?:複本|副本)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function metricMerge(items, key) {
  const out = { leads: 0, spend: 0, impressions: 0, clicks: 0, leadDays: 0 };
  for (const item of items) {
    const m = item[key] || {};
    out.leads += Number(m.leads || 0);
    out.spend += Number(m.spend || 0);
    out.impressions += Number(m.impressions || 0);
    out.clicks += Number(m.clicks || 0);
    out.leadDays = Math.max(out.leadDays, Number(m.leadDays || 0));
  }
  out.cpl = out.leads > 0 ? round(out.spend / out.leads) : null;
  out.ctr = out.impressions > 0 ? round(out.clicks / out.impressions * 100) : null;
  return out;
}

function rescore(item) {
  const growth = item.previous14.leads > 0
    ? item.recent14.leads / item.previous14.leads
    : (item.recent14.leads > 0 ? 9.99 : 0);
  const isNew = String(item.latestCreated || '') >= '2026-07-03';
  const efficient = item.total.leads > 5 && item.total.cpl != null && item.total.cpl < 8;
  const continuous = item.recent14.leadDays >= 3 || item.recent14.leads >= 5;
  const improving = item.recent14.leads >= 2 && growth >= 1.15;
  const newImproving = isNew && item.recent7.leads >= 1 &&
    item.recent7.leads >= item.previous7.leads;
  item.growth14 = round(growth);
  item.flags = { efficient, continuous, improving, newImproving, isNew };
  item.score = round(
    item.total.leads +
    item.recent14.leads * 2.3 +
    item.recent7.leads * 1.7 +
    (efficient ? 18 : 0) +
    (continuous ? 12 : 0) +
    (improving ? Math.min(18, growth * 5) : 0) +
    (newImproving ? 10 : 0)
  );
  return item;
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

function visualFingerprint(file) {
  const result = spawnSync('ffmpeg', [
    '-v', 'error', '-i', file,
    '-vf', 'scale=32:32:flags=lanczos,format=gray',
    '-f', 'rawvideo', '-',
  ], { encoding: null, maxBuffer: 2 * 1024 * 1024 });
  if (result.status !== 0 || result.stdout.length < 1024) {
    throw new Error(`ffmpeg fingerprint failed: ${String(result.stderr).slice(0, 180)}`);
  }
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
  const medianSource = coeff.slice(1).sort((a, b) => a - b);
  const median = medianSource[Math.floor(medianSource.length / 2)];
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
  const exact = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  return { phash, dhash, exact };
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

async function attachFingerprint(item) {
  try {
    item.cacheFile = await download(item.imageUrl);
    item.fingerprint = visualFingerprint(item.cacheFile);
    return item;
  } catch (error) {
    item.imageError = String(error.message || error);
    return null;
  }
}

// Only candidates that actually produced a lead can be performance-verified.
const performancePool = candidates.filter(c => c.total?.leads > 0 && c.imageUrl);
console.log(`fingerprinting ${performancePool.length} performance visuals...`);
const perfReady = [];
let fpIndex = 0;
const fpWorkers = Array.from({ length: 6 }, async () => {
  for (;;) {
    const index = fpIndex++;
    if (index >= performancePool.length) return;
    const ready = await attachFingerprint(performancePool[index]);
    if (ready) perfReady.push(ready);
  }
});
await Promise.all(fpWorkers);
console.log(`performance fingerprints ready: ${perfReady.length}/${performancePool.length}`);

// Merge near-identical city/relaunch variants within each advertiser.
const perfClusters = [];
for (const spec of ACCOUNT_ORDER) {
  const rows = perfReady.filter(c => c.account === spec.account).sort((a, b) => b.score - a.score);
  const accountClusters = [];
  for (const row of rows) {
    const cluster = accountClusters.find(c => sameVisual(c.fingerprint, row.fingerprint));
    if (cluster) cluster.members.push(row);
    else accountClusters.push({ fingerprint: row.fingerprint, members: [row] });
  }
  for (const cluster of accountClusters) {
    const members = cluster.members;
    const representative = [...members].sort((a, b) => b.score - a.score)[0];
    const merged = {
      ...representative,
      fingerprint: cluster.fingerprint,
      cacheFile: representative.cacheFile,
      names: [...new Set(members.flatMap(m => m.names || [m.name]))],
      headlines: [...new Set(members.flatMap(m => m.headlines || []))],
      bodies: [...new Set(members.flatMap(m => m.bodies || []))],
      adIds: [...new Set(members.flatMap(m => m.adIds || []))],
      adsetIds: [...new Set(members.flatMap(m => m.adsetIds || []))],
      total: metricMerge(members, 'total'),
      recent14: metricMerge(members, 'recent14'),
      previous14: metricMerge(members, 'previous14'),
      recent7: metricMerge(members, 'recent7'),
      previous7: metricMerge(members, 'previous7'),
      firstLeadDate: members.map(m => m.firstLeadDate).filter(Boolean).sort()[0] || null,
      lastLeadDate: members.map(m => m.lastLeadDate).filter(Boolean).sort().at(-1) || null,
      created: members.map(m => m.created).filter(Boolean).sort()[0] || null,
      latestCreated: members.map(m => m.latestCreated).filter(Boolean).sort().at(-1) || null,
      visualVariants: members.length,
    };
    merged.name = bestName(merged.names);
    perfClusters.push(rescore(merged));
  }
}

function libraryRows(code) {
  return library
    .filter(row => row.social_account_code === code && row.review_status === 'approved')
    .map(row => {
      const assets = parseJSON(row.assets, []);
      const copy = parseJSON(row.copy, {});
      const image = assets.find(a => a.kind === 'image' && a.gcs_url);
      return image ? {
        accountCode: code,
        libraryId: row.id,
        tier: 'B',
        name: row.name,
        names: [row.name],
        imageUrl: image.gcs_url,
        uploadedAt: String(row.uploaded_at || '').slice(0, 10),
        headlines: copy.headlines || [],
        bodies: copy.primary_texts || [],
      } : null;
    })
    .filter(Boolean)
    .sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)) || b.libraryId - a.libraryId);
}

const chosen = [];
const chosenFingerprints = [];
for (const spec of ACCOUNT_ORDER) {
  const rows = perfClusters
    .filter(row => row.account === spec.account)
    .sort((a, b) => b.score - a.score);
  const local = [];
  for (const row of rows) {
    if (local.length >= spec.target) break;
    if (chosenFingerprints.some(fp => sameVisual(fp, row.fingerprint))) continue;
    row.tier = 'A';
    local.push(row);
    chosenFingerprints.push(row.fingerprint);
  }

  if (local.length < spec.target) {
    for (const row of libraryRows(spec.code)) {
      if (local.length >= spec.target) break;
      const ready = await attachFingerprint(row);
      if (!ready) continue;
      if (chosenFingerprints.some(fp => sameVisual(fp, row.fingerprint))) continue;
      local.push(row);
      chosenFingerprints.push(row.fingerprint);
    }
  }
  if (local.length < spec.target) {
    throw new Error(`${spec.account} only has ${local.length}/${spec.target} unique usable visuals`);
  }

  for (let i = 0; i < local.length; i++) {
    const row = local[i];
    const file = `${spec.slug}_${String(i + 1).padStart(2, '0')}.jpg`;
    const output = path.join(ASSET_DIR, file);
    const converted = spawnSync('ffmpeg', [
      '-y', '-v', 'error', '-i', row.cacheFile,
      '-vf', 'scale=1200:-2:flags=lanczos',
      '-frames:v', '1', '-q:v', '3', output,
    ], { encoding: 'utf8' });
    if (converted.status !== 0) throw new Error(`asset conversion failed for ${row.name}: ${converted.stderr}`);

    const displayName = cleanConcept(bestName(row.names || [row.name]));
    const adNumber = displayName.match(/\b(?:2|3)[0-9]{4}\b/)?.[0] || null;
    const m = row.total || {};
    const trendPct = row.previous14?.leads > 0
      ? round((row.recent14.leads / row.previous14.leads - 1) * 100, 0)
      : (row.recent14?.leads > 0 ? null : 0);
    chosen.push({
      account: spec.account,
      rank: i + 1,
      tier: row.tier,
      concept: displayName,
      adNumber,
      name: displayName,
      leads: row.tier === 'A' ? m.leads : null,
      spend: row.tier === 'A' ? round(m.spend) : null,
      cpl: row.tier === 'A' ? m.cpl : null,
      ctr: row.tier === 'A' ? m.ctr : null,
      recent14Leads: row.tier === 'A' ? row.recent14.leads : null,
      previous14Leads: row.tier === 'A' ? row.previous14.leads : null,
      recent7Leads: row.tier === 'A' ? row.recent7.leads : null,
      previous7Leads: row.tier === 'A' ? row.previous7.leads : null,
      trendPct: row.tier === 'A' ? trendPct : null,
      firstLeadDate: row.tier === 'A' ? row.firstLeadDate : null,
      lastLeadDate: row.tier === 'A' ? row.lastLeadDate : null,
      created: row.tier === 'A' ? row.created : row.uploadedAt,
      active: row.tier === 'A' ? row.active : null,
      variants: row.tier === 'A' ? Math.max(row.visualVariants || 1, row.adsetIds?.length || 1) : null,
      flags: row.tier === 'A' ? row.flags : {},
      image: `assets/${file}`,
      headlines: (row.headlines || []).slice(0, 5),
      bodies: (row.bodies || []).slice(0, 2),
      source: row.tier === 'A' ? 'Meta Insights' : 'Arkio 素材庫',
      libraryId: row.libraryId || null,
    });
  }
  console.log(`${spec.account}: ${local.filter(x => x.tier === 'A').length} performance + ${local.filter(x => x.tier === 'B').length} library = ${local.length}`);
}

fs.writeFileSync(path.join(__dir, 'monitor_data.json'), JSON.stringify(chosen, null, 2));
console.log(JSON.stringify({
  total: chosen.length,
  performance: chosen.filter(x => x.tier === 'A').length,
  library: chosen.filter(x => x.tier === 'B').length,
  leads: chosen.reduce((sum, x) => sum + (x.leads || 0), 0),
}, null, 2));
