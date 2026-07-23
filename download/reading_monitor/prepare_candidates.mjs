// Convert raw_2m.json into ad-visual candidates grouped by advertiser + visual.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(fs.readFileSync(path.join(__dir, 'raw_2m.json'), 'utf8'));

const ACCOUNTS = {
  '526323183897076': { account: '育兒小百科', code: 'child_wiki' },
  '136787099518614': { account: '輕鬆學國英數', code: 'easylearning_tw' },
  '448515961688859': { account: '繪本福利社', code: 'little_pages_club' },
  '518977501296228': { account: '親子愛共讀', code: 'parent_reading' },
  '100918212446595': { account: 'JoJo閱讀', code: 'jojoreading_tw' },
};

const FROM = raw.date_from;
const TO = raw.date_to;
const RECENT14 = '2026-07-10';
const PREV14 = '2026-06-26';
const RECENT7 = '2026-07-17';
const PREV7 = '2026-07-10';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function leadOf(row) {
  const actions = row.actions || [];
  const action = actions.find(a => a.action_type === 'initiate_checkout');
  return num(action?.value);
}

function dayValues(insights) {
  return (insights?.data || []).map(row => ({
    date: row.date_start,
    leads: leadOf(row),
    spend: num(row.spend),
    impressions: num(row.impressions),
    clicks: num(row.clicks),
  }));
}

function imageHash(creative) {
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

function mergeText(group, creative) {
  const feed = creative?.asset_feed_spec || {};
  for (const h of feed.titles || []) {
    const text = String(h?.text || '').trim();
    if (text && !group.headlines.includes(text)) group.headlines.push(text);
  }
  for (const b of feed.bodies || []) {
    const text = String(b?.text || '').trim();
    if (text && !group.bodies.includes(text)) group.bodies.push(text);
  }
}

const groups = new Map();
for (const [adsetId, payload] of Object.entries(raw.adsets || {})) {
  const meta = raw.adsets_meta?.[adsetId] || {};
  for (const ad of payload?.ads?.data || []) {
    const creative = ad.creative || {};
    const pageId = pageIdOf(creative);
    const owner = ACCOUNTS[pageId];
    if (!owner) continue;
    const visual = imageHash(creative);
    if (!visual) continue;
    const key = `${owner.code}:${visual}`;
    if (!groups.has(key)) {
      groups.set(key, {
        account: owner.account,
        accountCode: owner.code,
        pageId,
        visualKey: String(visual),
        imageUrl: creative.image_url || creative.thumbnail_url || '',
        adIds: [],
        adsetIds: [],
        names: [],
        creativeIds: [],
        statuses: [],
        createdDates: [],
        headlines: [],
        bodies: [],
        days: {},
      });
    }
    const group = groups.get(key);
    if (ad.id && !group.adIds.includes(ad.id)) group.adIds.push(ad.id);
    if (!group.adsetIds.includes(adsetId)) group.adsetIds.push(adsetId);
    for (const name of [ad.name, payload.name, meta.name, meta.campaign_name, creative.name]) {
      if (name && !group.names.includes(name)) group.names.push(name);
    }
    if (creative.id && !group.creativeIds.includes(creative.id)) group.creativeIds.push(creative.id);
    if (ad.effective_status || ad.status) group.statuses.push(ad.effective_status || ad.status);
    if (ad.created_time) group.createdDates.push(ad.created_time.slice(0, 10));
    if (meta.created_time) group.createdDates.push(meta.created_time.slice(0, 10));
    mergeText(group, creative);
    for (const day of dayValues(ad.insights)) {
      const d = group.days[day.date] ||= { leads: 0, spend: 0, impressions: 0, clicks: 0 };
      d.leads += day.leads;
      d.spend += day.spend;
      d.impressions += day.impressions;
      d.clicks += day.clicks;
    }
  }
}

function sumRange(days, start, end = TO) {
  const out = { leads: 0, spend: 0, impressions: 0, clicks: 0, leadDays: 0 };
  for (const [date, d] of Object.entries(days)) {
    if (date < start || date > end) continue;
    out.leads += d.leads;
    out.spend += d.spend;
    out.impressions += d.impressions;
    out.clicks += d.clicks;
    if (d.leads > 0) out.leadDays++;
  }
  out.cpl = out.leads > 0 ? out.spend / out.leads : null;
  out.ctr = out.impressions > 0 ? out.clicks / out.impressions * 100 : null;
  return out;
}

function round(n, digits = 2) {
  return n == null ? null : Number(n.toFixed(digits));
}

const candidates = [...groups.values()].map(group => {
  const total = sumRange(group.days, FROM);
  const recent14 = sumRange(group.days, RECENT14);
  const previous14 = sumRange(group.days, PREV14, '2026-07-09');
  const recent7 = sumRange(group.days, RECENT7);
  const previous7 = sumRange(group.days, PREV7, '2026-07-16');
  const leadDates = Object.entries(group.days).filter(([, d]) => d.leads > 0).map(([date]) => date).sort();
  const created = [...new Set(group.createdDates)].sort();
  const growth14 = previous14.leads > 0 ? recent14.leads / previous14.leads : (recent14.leads > 0 ? 9.99 : 0);
  const growth7 = previous7.leads > 0 ? recent7.leads / previous7.leads : (recent7.leads > 0 ? 9.99 : 0);
  const isNew = (created.at(-1) || '') >= '2026-07-03';
  const continuous = recent14.leadDays >= 3 || (recent7.leadDays >= 2 && recent14.leads >= 3);
  const improving = recent14.leads >= 2 && growth14 >= 1.15;
  const newImproving = isNew && recent7.leads >= 1 && growth7 >= 1;
  const efficient = total.leads > 5 && total.cpl != null && total.cpl < 8;
  const eligible = efficient || total.leads >= 10 || continuous || improving || newImproving;
  const score =
    total.leads +
    recent14.leads * 2.3 +
    recent7.leads * 1.7 +
    (efficient ? 18 : 0) +
    (continuous ? 12 : 0) +
    (improving ? Math.min(18, 5 * growth14) : 0) +
    (newImproving ? 10 : 0);
  return {
    ...group,
    days: undefined,
    name: group.names[0] || '',
    created: created[0] || null,
    latestCreated: created.at(-1) || null,
    firstLeadDate: leadDates[0] || null,
    lastLeadDate: leadDates.at(-1) || null,
    active: group.statuses.some(s => String(s).toUpperCase() === 'ACTIVE'),
    total: { ...total, cpl: round(total.cpl), ctr: round(total.ctr) },
    recent14: { ...recent14, cpl: round(recent14.cpl), ctr: round(recent14.ctr) },
    previous14: { ...previous14, cpl: round(previous14.cpl), ctr: round(previous14.ctr) },
    recent7: { ...recent7, cpl: round(recent7.cpl), ctr: round(recent7.ctr) },
    previous7: { ...previous7, cpl: round(previous7.cpl), ctr: round(previous7.ctr) },
    growth14: round(growth14),
    growth7: round(growth7),
    flags: { efficient, continuous, improving, newImproving, isNew },
    eligible,
    score: round(score),
  };
}).sort((a, b) => b.score - a.score);

fs.writeFileSync(path.join(__dir, 'candidates_2m.json'), JSON.stringify(candidates, null, 2));

const summary = {};
for (const account of Object.values(ACCOUNTS).map(a => a.account)) {
  const all = candidates.filter(c => c.account === account);
  const eligible = all.filter(c => c.eligible);
  summary[account] = {
    visuals: all.length,
    eligible: eligible.length,
    leads: all.reduce((sum, c) => sum + c.total.leads, 0),
    top: eligible.slice(0, 8).map(c => ({
      name: c.name,
      leads: c.total.leads,
      cpl: c.total.cpl,
      r14: c.recent14.leads,
      p14: c.previous14.leads,
      score: c.score,
    })),
  };
}
console.log(JSON.stringify(summary, null, 2));
