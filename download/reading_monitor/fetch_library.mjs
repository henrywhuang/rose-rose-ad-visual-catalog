// Cache the complete Arkio creative library for performance-gap backfills.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '..', '..', '..');
const token = fs.readFileSync(path.join(ROOT, '.arkio_token'), 'utf8').trim();
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
const API = 'https://www.arkio.me/api/v1/marketing/creative-library';
const all = [];

for (let page = 1; page <= 20; page++) {
  const url = `${API}?${new URLSearchParams({ page: String(page), page_size: '200' })}`;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} on page ${page}`);
  const json = await response.json();
  const rows = json.data || [];
  all.push(...rows);
  console.log(`page ${page}: ${rows.length} | total ${all.length}`);
  if (rows.length < 200) break;
}

fs.writeFileSync(path.join(__dir, 'creative_library.json'), JSON.stringify(all));
const counts = {};
for (const row of all) counts[row.social_account_code || '(blank)'] = (counts[row.social_account_code || '(blank)'] || 0) + 1;
console.log(JSON.stringify({ total: all.length, counts }, null, 2));
