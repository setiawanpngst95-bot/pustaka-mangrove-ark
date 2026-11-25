// Pengambilan data harian dari OpenAlex ke Supabase. Node 20+, tanpa paket tambahan.
// Env: OPENALEX_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
// Opsional: DRY_RUN=1 (hanya tampilkan, tidak menulis), MAX_PAGES (default 3), SINCE (YYYY-MM-DD)
const { OPENALEX_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
const DRY = process.env.DRY_RUN === '1';
const MAX_PAGES = Number(process.env.MAX_PAGES || 3);
const need = DRY ? ['OPENALEX_API_KEY'] : ['OPENALEX_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
for (const k of need) if (!process.env[k]) { console.error(`Env ${k} belum diisi`); process.exit(1); }

const QUERIES = [
  ['mangrove', '"mangrove"'],
  ['terumbu-karang', '"coral reef"'],
  ['lamun', '"seagrass"'],
  ['karbon-biru', '"blue carbon"'],
  ['wisata-pesisir', '"coastal tourism"'],
  ['biodiversitas-pesisir', '"coastal biodiversity"'],
];
const FIELDS = 'id,doi,title,publication_year,language,type,primary_location,open_access,topics,abstract_inverted_index,authorships';

const sb = (path, init = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
});

function rebuildAbstract(inv) {
  if (!inv) return null;
  const words = [];
  for (const [w, pos] of Object.entries(inv)) for (const p of pos) words[p] = w;
  return words.filter(Boolean).join(' ');
}

function toRow(w, tag) {
  const loc = w.primary_location || {};
  const lic = loc.license || null;
  // OpenAlex tidak mengirim abstrak teks "karena alasan hukum": simpan hanya bila lisensi terbuka (cc*).
  const openLicense = typeof lic === 'string' && lic.toLowerCase().startsWith('cc');
  const countries = new Set();
  for (const a of w.authorships || []) for (const c of a.countries || []) countries.add(c);
  return {
    openalex_id: w.id,
    doi: w.doi || null,
    title: w.title || '(tanpa judul)',
    abstract: openLicense ? rebuildAbstract(w.abstract_inverted_index) : null,
    year: w.publication_year || null,
    language: w.language || null,
    work_type: w.type || null,
    venue: loc.source?.display_name || null,
    oa_status: w.open_access?.oa_status || null,
    oa_url: w.open_access?.oa_url || null,
    landing_url: loc.landing_page_url || w.doi || null,
    license: lic,
    topics: (w.topics || []).map((t) => t.display_name).slice(0, 3),
    country_codes: [...countries],
    query_tag: tag,
  };
}

async function sinceDate() {
  if (process.env.SINCE) return process.env.SINCE;
  if (DRY) return '2024-01-01';
  const r = await sb('ingest_runs?select=since_date,finished_at&error=is.null&finished_at=not.is.null&order=finished_at.desc&limit=1');
  const j = await r.json();
  return j?.[0]?.finished_at?.slice(0, 10) || '2020-01-01';
}

async function main() {
  const since = await sinceDate();
  let runId = null;
  if (!DRY) {
    const r = await sb('ingest_runs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ since_date: since }) });
    runId = (await r.json())[0].id;
  }
  let fetched = 0, stored = 0, error = null;
  try {
    for (const [tag, term] of QUERIES) {
      let cursor = '*';
      for (let page = 0; page < MAX_PAGES && cursor; page++) {
        const url = new URL('https://api.openalex.org/works');
        url.searchParams.set('search.title_and_abstract', term);
        url.searchParams.set('filter', `from_publication_date:${since}`);
        url.searchParams.set('select', FIELDS);
        url.searchParams.set('per_page', '100');
        url.searchParams.set('cursor', cursor);
        const res = await fetch(url, { headers: { Authorization: `Bearer ${OPENALEX_API_KEY}` } });
        if (!res.ok) throw new Error(`OpenAlex ${res.status} untuk ${tag}: ${(await res.text()).slice(0, 200)}`);
        const data = await res.json();
        const rows = (data.results || []).map((w) => toRow(w, tag));
        fetched += rows.length;
        console.log(`${tag} halaman ${page + 1}: ${rows.length} karya`);
        if (DRY) {
          if (page === 0 && rows[0]) console.log('Contoh baris:', JSON.stringify(rows[0], null, 2).slice(0, 900));
        } else if (rows.length) {
          const up = await sb('works?on_conflict=openalex_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
          if (!up.ok) throw new Error(`Supabase ${up.status}: ${(await up.text()).slice(0, 300)}`);
          stored += rows.length;
        }
        cursor = data.meta?.next_cursor || null;
        if (!rows.length) break;
      }
    }
  } catch (e) {
    error = String(e.message || e);
    console.error('GAGAL:', error);
  }
  if (!DRY) await sb(`ingest_runs?id=eq.${runId}`, { method: 'PATCH', body: JSON.stringify({ finished_at: new Date().toISOString(), fetched, stored, error }) });
  console.log(`Selesai. Diambil ${fetched}, disimpan ${stored}${error ? ', ada galat' : ''}.`);
  if (error) process.exit(1);
}
main();
