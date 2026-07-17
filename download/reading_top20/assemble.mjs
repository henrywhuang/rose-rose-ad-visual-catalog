// 组装「近2个月表现最好的20支阅读广告」数据 + 下载视觉。
// 数据源：Arkio ad-budget dashboard（绩效，实时）+ Arkio 代理的 Meta creative（视觉/文案/页面）。
// 口径：Reading business_line；窗口 2026-06-04→07-17（两快照合并）；
//       排序主指标=近2月累计领课(leads_backend，backend不准时回退meta)，兼顾持续领课天数、CPL、CTR。
//       相同视觉在多个投放账号跑的，统一为一支并合并领课、列出全部投放主。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../../..');
const TOKEN = fs.readFileSync(path.join(ROOT, '.arkio_token'), 'utf8').trim();
const API = 'https://www.arkio.me/api/v1';
const H = { Authorization: `Bearer ${TOKEN}` };

const sa = JSON.parse(fs.readFileSync('/tmp/sa.json', 'utf8')).data;
const pageMap = Object.fromEntries(sa.map(x => [x.fb_page_id, x.fb_page_name || x.display_name]));
pageMap['470378269499737'] = 'Claire｜雙語媽媽號';
const C = JSON.parse(fs.readFileSync('/tmp/reading_creatives.json', 'utf8'));
const byName = (kw, leads) => C.find(c => c.adName.includes(kw) && (leads == null || c.leads === leads));

// 20 支（去重后），按主题四大类；每组 primary 决定视觉/文案，adsetKeys 合并绩效
const G = [
  // 情緒 (5)
  { no:'25248', theme:'情緒', title:'中班情緒痛點・純字短文案', keys:[['25248',137]], note:'純文字痛點鉤子，情緒主題近2月最高領課' },
  { no:'25942', theme:'情緒', title:'情緒繪本復刻・冷靜', keys:[['25942',128]] },
  { no:'25554', theme:'情緒', title:'怒火小寶貝復刻', keys:[['25554',115]] },
  { no:'25332', theme:'情緒', title:'我不是壞小孩・通投', keys:[['25332',28,'小百科'],['25332',28,'JOJO閱讀']], note:'同視覺跨育兒小百科＋JoJo閱讀兩投放主，領課合併' },
  { no:'25342', theme:'情緒', title:'我不是壞小孩・高雄市', keys:[['25342',23]] },
  // 識字 (5)
  { no:'25325', theme:'識字', title:'108課綱識字卡拼圖・多圖藍', keys:[['25325',736],['25325',375]], note:'鉤子測試冠軍款，跨帳號合併領課逾千' },
  { no:'25954', theme:'識字', title:'暑假識字練習・學習單', keys:[['25954',58]] },
  { no:'25968', theme:'識字', title:'108識字卡拼圖（育兒小百科）', keys:[['25968',24]] },
  { no:'25962', theme:'識字', title:'108識字卡拼圖（輕鬆學）', keys:[['25962',23]] },
  { no:'25969', theme:'識字', title:'復刻・108識字卡拼圖2', keys:[['25969',9]] },
  // 正音表達 (3)
  { no:'25904', theme:'正音表達', title:'注音識字班', keys:[['25904',365]], note:'正音主題最高領課' },
  { no:'25884', theme:'正音表達', title:'ㄈㄊ正音班', keys:[['25884',314]] },
  { no:'23942', theme:'正音表達', title:'正音班・新北市', keys:[['23942',7]] },
  // 其他 (7)
  { no:'25606', theme:'其他', title:'我們免費了・桃園市', keys:[['25606',247]], note:'品牌福利鉤子，領課量前段班' },
  { no:'25607', theme:'其他', title:'我們免費了・台中市', keys:[['25607',161]] },
  { no:'25457-1', theme:'其他', title:'ADHD自測表 1', keys:[['ADHD自測表1',25]], note:'測評鉤子，CTR 8%+' },
  { no:'25457-7', theme:'其他', title:'ADHD自測表 7', keys:[['ADHD自測表7',11]], note:'測評鉤子，CTR 11%+（本批最高）' },
  { no:'25831', theme:'其他', title:'5日共讀徵集・台北市', keys:[['25831',17]] },
  { no:'25299', theme:'其他', title:'博客來小孩繪本・台北市', keys:[['25299',5]] },
  { no:'25304', theme:'其他', title:'博客來小孩繪本・新竹縣市', keys:[['25304',4]] },
];

const F = 'id,name,ads{id,name,effective_status,creative{id,name,image_url,thumbnail_url,object_story_spec,asset_feed_spec}}';
async function fetchCreative(adsetId) {
  const u = new URL(`${API}/meta/ads/adset/${adsetId}`); u.searchParams.set('fields', F);
  const j = await (await fetch(u, { headers: H })).json();
  const ads = j.ads?.data || [];
  const pick = ads.find(a => a.effective_status === 'ACTIVE' && (a.creative?.image_url || a.creative?.asset_feed_spec?.images?.length))
            || ads.find(a => a.creative?.image_url || a.creative?.asset_feed_spec?.images?.length) || ads[0];
  const cr = pick?.creative || {};
  const oss = cr.object_story_spec || {}; const afs = cr.asset_feed_spec || {};
  const img = cr.image_url || afs.images?.[0]?.url || cr.thumbnail_url || oss.link_data?.picture || '';
  const bodies = (afs.bodies?.map(b => b.text).filter(Boolean)) || [oss.link_data?.message].filter(Boolean);
  const titles = (afs.titles?.map(t => t.text).filter(Boolean)) || [oss.link_data?.name].filter(Boolean);
  const link = oss.link_data?.link || afs.link_urls?.[0]?.website_url || '';
  const page = pageMap[oss.page_id] || pageMap[afs.additional_data?.page_id] || null;
  return { img, bodies: [...new Set(bodies)], titles: [...new Set(titles)], link, page };
}

const dir = path.join(__dir, 'assets');
fs.mkdirSync(dir, { recursive: true });
const out = [];
for (const g of G) {
  // 合并绩效
  const rows = g.keys.map(([kw, leads, sub]) => {
    let cands = C.filter(c => c.adName.includes(kw) && (leads == null || c.leads === leads));
    if (sub) cands = cands.filter(c => c.adName.includes(sub));
    return cands[0];
  }).filter(Boolean);
  const primaryRow = rows[0];
  const cr = await fetchCreative(primaryRow.adsetId);
  // download image
  let imgFile = '';
  if (cr.img) {
    try { const r = await fetch(cr.img); const b = Buffer.from(await r.arrayBuffer());
      imgFile = `assets/${g.no}.png`; fs.writeFileSync(path.join(__dir, `${g.no}.png`.replace(/^/, 'assets/')), b);
    } catch (e) { console.log('img fail', g.no, e.message); }
  }
  const owners = [...new Set(rows.map(r => r.owner?.name).filter(n => n && n !== '?').concat(cr.page ? [cr.page] : []))];
  const leadsSum = rows.reduce((s, r) => s + (r.leads || 0), 0);
  const lbSum = rows.reduce((s, r) => s + (r.tLB || 0), 0);
  const lmSum = rows.reduce((s, r) => s + (r.tLM || 0), 0);
  const spendSum = rows.reduce((s, r) => s + (r.spend || 0), 0);
  const cpl = leadsSum > 0 ? +(spendSum / leadsSum).toFixed(2) : null;
  const ctr = Math.max(...rows.map(r => r.ctr7 || 0));
  const dLeads = Math.max(...rows.map(r => r.dLeads || 0));
  const dActive = Math.max(...rows.map(r => r.dActive || 0));
  out.push({
    no: g.no, theme: g.theme, title: g.title, note: g.note || '',
    owners: owners.length ? owners : ['—'],
    leads: leadsSum, leadsBackend: lbSum, leadsMeta: lmSum, spend: Math.round(spendSum),
    cpl, ctr: +ctr.toFixed(2), consistency: `${dLeads}/${dActive}`,
    accounts: rows.map(r => r.status), adNames: rows.map(r => r.adName),
    image: imgFile, bodies: cr.bodies, titles: cr.titles, link: cr.link,
  });
  console.log(g.theme, g.no, '| 領課', leadsSum, '| CPL', cpl, '| CTR', ctr, '| 投放主', owners.join('+'), '| img', imgFile ? 'OK' : 'MISS');
}
out.sort((a, b) => b.leads - a.leads);
fs.writeFileSync(path.join(__dir, '..', 'reading_top20_data.json'), JSON.stringify(out, null, 2));
fs.writeFileSync(path.join(__dir, 'data_full.json'), JSON.stringify(out, null, 2));
console.log('\n完成', out.length, '支');
