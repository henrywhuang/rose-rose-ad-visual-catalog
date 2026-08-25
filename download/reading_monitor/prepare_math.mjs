// Identify Taiwan math ads in raw_2m.json and aggregate ad-level daily metrics
// by advertiser + Meta image hash before perceptual deduplication.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '..', '..', '..');
const raw = JSON.parse(fs.readFileSync(path.join(__dir, 'raw_2m.json'), 'utf8'));
const addDays = (date, days) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
// raw_2m.json is shared with the four-month reading roster. Keep the math
// ranking on its own rolling two-month window even when the shared fetch is wider.
const MATH_FROM = addDays(raw.date_to, -60);
const MATH_TO = raw.date_to;
const token = fs.readFileSync(path.join(ROOT, '.arkio_token'), 'utf8').trim();
const response = await fetch('https://www.arkio.me/api/v1/social-accounts', {
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  signal: AbortSignal.timeout(30000),
});
if (!response.ok) throw new Error(`social accounts HTTP ${response.status}`);
const socialAccounts = (await response.json()).data || [];

const DISPLAY_OVERRIDES = {
  child_wiki: '育兒小百科',
  easylearning_tw: '輕鬆學國英數',
  little_pages_club: '繪本福利社',
  parent_reading: '親子愛共讀',
  jojoreading_tw: 'JoJo閱讀',
  jojomath_tw: 'JoJo數學',
  claire_tw: 'Claire',
};
const pageMap = new Map(socialAccounts.filter(x => x.fb_page_id).map(x => [
  String(x.fb_page_id),
  {
    code: x.code,
    display: DISPLAY_OVERRIDES[x.code] || x.display_name || x.fb_page_name || x.code,
  },
]));
// Historical Taiwan math page no longer appears in the current social-account
// directory, but remains identifiable in Meta ad creatives.
pageMap.set('470378269499737', { code: 'claire_math_tw', display: 'Claire國小數學' });

// Deliberately excludes generic words such as「遊戲」「迷宮」unless a clear
// math term is also present.
const MATH_RE = /(?:jo\s*math|jomath|數學|数学|算數|算术|計算|计算|加減|加减|加法|減法|减法|乘法|除法|九九|口訣|口诀|應用題|应用题|數感|数感|算術|數字運算|数字运算|分數|分数|小數|小数|幾何|几何|圖形|图形|時鐘|时钟|錢幣|钱币|量感|四則|四则)/i;
const FALSE_POSITIVE_RE = /(?:英語|英文|注音|識字|阅读|閱讀|情緒|共讀)/i;

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function leadOf(row) {
  return num((row.actions || []).find(a => a.action_type === 'initiate_checkout')?.value);
}

function visualKey(creative) {
  const spec = creative?.object_story_spec || {};
  return spec.link_data?.image_hash ||
    spec.photo_data?.image_hash ||
    spec.video_data?.image_hash ||
    creative?.effective_object_story_id ||
    creative?.id;
}

function storyText(creative) {
  const spec = creative?.object_story_spec || {};
  const link = spec.link_data || {};
  const photo = spec.photo_data || {};
  const video = spec.video_data || {};
  return [
    link.link, link.message, link.name, link.caption, link.description,
    photo.caption, video.message, video.title,
  ].filter(Boolean).join('\n');
}

function feedText(creative) {
  const feed = creative?.asset_feed_spec || {};
  return [
    ...(feed.bodies || []).map(x => x?.text),
    ...(feed.titles || []).map(x => x?.text),
    ...(feed.descriptions || []).map(x => x?.text),
  ].filter(Boolean).join('\n');
}

function isMathAd(meta, payload, ad) {
  const creative = ad.creative || {};
  const names = [
    meta.campaign_name, meta.name, payload.name, ad.name, creative.name,
  ].filter(Boolean).join('\n');
  if (MATH_RE.test(names)) return true;
  const copy = `${storyText(creative)}\n${feedText(creative)}`;
  // Copy-only matches require two math signals or a JoMath landing URL to avoid
  // broad educational-copy false positives.
  const signals = copy.match(new RegExp(MATH_RE.source, 'gi')) || [];
  if (/jomath/i.test(copy)) return true;
  return signals.length >= 2 && !FALSE_POSITIVE_RE.test(names);
}

function preferredName(names) {
  const generic = /^(?:ad\s*\d+|\d+|廣告|素材)$/i;
  return [...new Set(names.filter(Boolean))]
    .map(name => ({
      name,
      score:
        (generic.test(name) ? -100 : 0) +
        (MATH_RE.test(name) ? 30 : 0) +
        (/\b(?:2|3)[0-9]{4}\b/.test(name) ? 15 : 0) +
        Math.min(String(name).length, 80) / 10,
    }))
    .sort((a, b) => b.score - a.score)[0]?.name || names[0] || '數學廣告';
}

const grouped = new Map();
let matchedAds = 0;
for (const [adsetId, payload] of Object.entries(raw.adsets || {})) {
  const meta = raw.adsets_meta?.[adsetId] || {};
  for (const ad of payload?.ads?.data || []) {
    if (!isMathAd(meta, payload, ad)) continue;
    const creative = ad.creative || {};
    const key = visualKey(creative);
    if (!key || !(creative.image_url || creative.thumbnail_url)) continue;
    matchedAds++;
    const pageId = String(creative.object_story_spec?.page_id || '');
    const owner = pageMap.get(pageId) || {
      code: pageId ? `page_${pageId}` : 'unknown',
      display: pageId ? `Meta粉專 ${pageId}` : '未辨識投放主',
    };
    const groupKey = `${owner.code}:${key}`;
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        account: owner.display,
        accountCode: owner.code,
        pageId,
        visualKey: String(key),
        imageUrl: creative.image_url || creative.thumbnail_url,
        names: [],
        headlines: [],
        bodies: [],
        adIds: [],
        adsetIds: [],
        days: {},
      });
    }
    const group = grouped.get(groupKey);
    for (const value of [meta.campaign_name, meta.name, payload.name, ad.name, creative.name]) {
      if (value && !group.names.includes(value)) group.names.push(value);
    }
    const feed = creative.asset_feed_spec || {};
    for (const h of feed.titles || []) {
      if (h?.text && !group.headlines.includes(h.text)) group.headlines.push(h.text);
    }
    for (const b of feed.bodies || []) {
      if (b?.text && !group.bodies.includes(b.text)) group.bodies.push(b.text);
    }
    if (ad.id && !group.adIds.includes(ad.id)) group.adIds.push(ad.id);
    if (!group.adsetIds.includes(adsetId)) group.adsetIds.push(adsetId);
    for (const row of ad.insights?.data || []) {
      const date = row.date_start;
      if (!date || date < MATH_FROM || date > MATH_TO) continue;
      const day = group.days[date] ||= { leads: 0, spend: 0, impressions: 0, clicks: 0 };
      day.leads += leadOf(row);
      day.spend += num(row.spend);
      day.impressions += num(row.impressions);
      day.clicks += num(row.clicks);
    }
  }
}

const round = (value, digits = 2) => Number(value.toFixed(digits));
const candidates = [...grouped.values()].map(group => {
  const totals = Object.values(group.days).reduce((out, day) => {
    out.leads += day.leads;
    out.spend += day.spend;
    out.impressions += day.impressions;
    out.clicks += day.clicks;
    return out;
  }, { leads: 0, spend: 0, impressions: 0, clicks: 0 });
  return {
    ...group,
    days: undefined,
    name: preferredName(group.names),
    leads: totals.leads,
    spend: round(totals.spend),
    impressions: totals.impressions,
    clicks: totals.clicks,
    cpl: totals.leads > 0 ? round(totals.spend / totals.leads) : null,
    ctr: totals.impressions > 0 ? round(totals.clicks / totals.impressions * 100) : null,
  };
}).filter(row => row.leads > 0).sort((a, b) => b.leads - a.leads || a.cpl - b.cpl);

fs.writeFileSync(path.join(__dir, 'math_candidates.json'), JSON.stringify(candidates, null, 2));
console.log(JSON.stringify({
  window: `${MATH_FROM}..${MATH_TO}`,
  matched_ads: matchedAds,
  visuals_with_leads: candidates.length,
  leads: candidates.reduce((sum, row) => sum + row.leads, 0),
  advertisers: Object.entries(candidates.reduce((out, row) => {
    out[row.account] = (out[row.account] || 0) + row.leads;
    return out;
  }, {})).sort((a, b) => b[1] - a[1]),
  top25: candidates.slice(0, 25).map(row => ({
    name: row.name,
    account: row.account,
    leads: row.leads,
    cpl: row.cpl,
    ctr: row.ctr,
  })),
}, null, 2));
