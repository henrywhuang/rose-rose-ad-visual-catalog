// 重建「最佳閱讀廣告」數據模型 v2：
// - 相同視覺去重合併為一組（記錄多個投放主 + 各自成效）
// - 移除 25884（動態素材無法取得正確清晰視覺、且主題與命名不符）
// - 新增 5 個獨立視覺好創意：25909 情緒學習單、25972 暑假識字練習、25869 注音尋寶卡、25971 注音先修班、25973 繪本練習包
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const C = JSON.parse(fs.readFileSync('/tmp/reading_creatives.json', 'utf8'));
const LIB = JSON.parse(fs.readFileSync('/tmp/creatives_all.json', 'utf8'));

// 依廣告編號 + adset 尾碼定位（同編號多 adset 時用尾碼）
const find = (no, tail) => C.find(c => String(c.adName).startsWith(no) && (!tail || c.adsetId.endsWith(tail)));
const shortOwner = (name, c) => {
  if ((!name || name === '?') && c && (c.page_id === '470378269499737' || /Claire/.test(c.adName))) return 'Claire｜雙語媽媽號';
  if (!name || name === '?') return '—';
  if (name.includes('育兒小百科')) return '育兒小百科';
  if (name.includes('輕鬆學')) return '輕鬆學國英數';
  if (name.includes('親子愛共讀')) return '親子愛共讀';
  if (name.includes('繪本福利社')) return '繪本福利社';
  if (name.includes('JoJo閱讀') || name.includes('JoJo閱讀')) return 'JoJo閱讀';
  if (name.includes('Claire')) return 'Claire｜雙語媽媽號';
  return name.slice(0, 12);
};
const memberOf = (no, tail, labelExtra) => {
  const c = find(no, tail);
  if (!c) return null;
  return {
    label: shortOwner(c.owner?.name, c) + (labelExtra ? `（${labelExtra}）` : ''),
    owner: shortOwner(c.owner?.name, c),
    leads: c.leads, cpl: c.cpl, ctr: c.ctr7, consistency: `${c.dLeads}/${c.dActive}`,
    _c: c,
  };
};
const copyOf = (c) => ({ headlines: c.titles || [], bodies: c.bodies || [] });

// 25909 情緒學習單（素材庫，無投放數據）
const lib909 = LIB.find(x => x.id === 632);
let c909 = {}; try { c909 = JSON.parse(lib909.copy || '{}'); } catch {}

// ---- 20 組定義（theme / title / 主視覺檔 / 成員 / 備註）----
const G = [];
const push = (o) => G.push(o);

// ===== 情緒 (5) =====
push({ theme:'情緒', title:'中班情緒痛點・純文字鉤子', image:'25248', new:false,
  members:[memberOf('25248')], note:'純文字痛點，情緒主題領課最高' });
push({ theme:'情緒', title:'情緒繪本課・冷靜', image:'25942', new:false,
  members:[memberOf('25942')] });
push({ theme:'情緒', title:'怒火小寶貝・拒當情緒化', image:'25554', new:false,
  members:[memberOf('25554')] });
push({ theme:'情緒', title:'我不是壞小孩・我只是很生氣', image:'25332', new:false, merged:true,
  members:[ memberOf('25332','970392','通投'), memberOf('25332','460392','通投'), memberOf('25342','730392','高雄市') ],
  note:'同視覺跨 育兒小百科 + JoJo閱讀 兩投放主（含高雄專投），成效分列' });
push({ theme:'情緒', title:'情緒表達學習單・9種情緒詞', image:'25909', new:true, lib:true,
  members:[{label:'輕鬆學國英數 + 育兒小百科', owner:'輕鬆學國英數/育兒小百科', leads:null, cpl:null, ctr:null, consistency:null}],
  headlines:c909.headlines||[], bodies:c909.primary_texts||[],
  note:'素材庫精選・情緒表達主題補充；視覺與文案完整，尚未在近2月投放池，供測試放大' });

// ===== 識字 (5) =====
push({ theme:'識字', title:'108課綱識字卡拼圖・多圖藍', image:'25325', new:false,
  members:[memberOf('25325','050269')], extraLeads:1111, note:'鉤子測試冠軍款，跨帳號合併領課逾千（輕鬆學）' });
push({ theme:'識字', title:'暑假識字練習・學習單（水/ㄅ格）', image:'25954', new:false,
  members:[memberOf('25954')] });
push({ theme:'識字', title:'108課綱識字卡・白卡格', image:'25962', new:false, merged:true,
  members:[ memberOf('25962','650392'), memberOf('25968','280392') ],
  note:'同視覺跨 輕鬆學國英數 + 育兒小百科 兩投放主，成效分列' });
push({ theme:'識字', title:'復刻・108識字卡拼圖2（彩色頁籤）', image:'25969', new:false, merged:true,
  members:[ memberOf('25969','100392'), memberOf('25970','740392') ],
  note:'同視覺跨 親子愛共讀 + 繪本福利社 兩投放主，成效分列' });
push({ theme:'識字', title:'暑假識字練習・注音＋詞語＋短句', image:'25972', new:true,
  members:[memberOf('25972')], note:'新上架創意，與冠軍識字系列同調性、版式不同' });

// ===== 正音表達 (4) =====
push({ theme:'正音表達', title:'注音識字班・5日免費', image:'25904', new:false,
  members:[memberOf('25904','400392')], note:'正音主題領課最高' });
push({ theme:'正音表達', title:'正音班・新北市（招生中）', image:'23942', new:false,
  members:[memberOf('23942')] });
push({ theme:'正音表達', title:'注音尋寶卡・大象迷宮', image:'25869', new:true,
  members:[memberOf('25869')], note:'新上架・注音迷宮遊戲卡新形式，CTR 4.3%' });
push({ theme:'正音表達', title:'暑假注音先修班・手寫＋拼音', image:'25971', new:true,
  members:[memberOf('25971')], note:'新上架創意，注音先修主題' });

// ===== 其他 (6) =====
push({ theme:'其他', title:'我們免費了・專注力遊戲卡', image:'25606', new:false, merged:true,
  members:[ memberOf('25606','330392','桃園市'), memberOf('25607','730392','台中市') ],
  note:'同視覺換城市（桃園/台中），投放主皆為親子愛共讀，成效分列' });
push({ theme:'其他', title:'ADHD 自測表 1・大腦額葉', image:'25457-1', new:false,
  members:[(()=>{const c=C.find(x=>x.adName.includes('ADHD自測表1'));return {label:shortOwner(c.owner?.name, c),owner:shortOwner(c.owner?.name, c),leads:c.leads,cpl:c.cpl,ctr:c.ctr7,consistency:`${c.dLeads}/${c.dActive}`,_c:c};})()],
  note:'測評鉤子，CTR 8%+' });
push({ theme:'其他', title:'ADHD 自測表 7・專注力', image:'25457-7', new:false,
  members:[(()=>{const c=C.find(x=>x.adName.includes('ADHD自測表7'));return {label:shortOwner(c.owner?.name, c),owner:shortOwner(c.owner?.name, c),leads:c.leads,cpl:c.cpl,ctr:c.ctr7,consistency:`${c.dLeads}/${c.dActive}`,_c:c};})()],
  note:'測評鉤子，CTR 11%+（本批最高）' });
push({ theme:'其他', title:'5日親子共讀徵集・台北市', image:'25831', new:false,
  members:[memberOf('25831')] });
push({ theme:'其他', title:'我會好好說・5日繪本情緒課', image:'25299', new:false, merged:true,
  members:[ memberOf('25299','610392','台北市'), memberOf('25304','710392','新竹縣市') ],
  note:'同視覺換城市（台北/新竹），投放主皆為育兒小百科，成效分列' });
push({ theme:'其他', title:'暑假繪本練習包・故事卡＋提問單', image:'25973', new:true,
  members:[memberOf('25973')], note:'新上架・繪本閱讀練習包新形式' });

// ---- 產出 ----
const out = G.map((g, i) => {
  const mem = (g.members || []).filter(Boolean);
  const owners = [...new Set(mem.map(m => m.owner).filter(Boolean).flatMap(o => o.split('/')))];
  const leadsTotal = g.extraLeads != null ? g.extraLeads : mem.reduce((s, m) => s + (m.leads || 0), 0);
  const primaryC = mem.find(m => m._c)?._c;
  const copy = g.lib ? { headlines: g.headlines, bodies: g.bodies } : (primaryC ? copyOf(primaryC) : { headlines: g.headlines || [], bodies: g.bodies || [] });
  return {
    idx: i + 1, theme: g.theme, title: g.title, image: `assets/${g.image}.png`,
    isNew: !!g.new, isMerged: !!g.merged, isLib: !!g.lib,
    owners, leadsTotal,
    members: mem.map(m => ({ label: m.label, leads: m.leads, cpl: m.cpl, ctr: m.ctr, consistency: m.consistency })),
    headlines: copy.headlines || [], bodies: copy.bodies || [], note: g.note || '',
  };
});

fs.writeFileSync(path.join(__dir, '..', 'reading_top20_data.json'), JSON.stringify(out, null, 2));
const byTheme = {}; out.forEach(o => byTheme[o.theme] = (byTheme[o.theme] || 0) + 1);
console.log('groups:', out.length, '| theme:', JSON.stringify(byTheme), '| new:', out.filter(o => o.isNew).length, '| merged:', out.filter(o => o.isMerged).length);
const miss = out.filter(o => o.members.some(m => m.leads == null) && !o.isLib);
out.forEach(o => { if (o.members.some(m => !m.label)) console.log('WARN missing member', o.title); });
