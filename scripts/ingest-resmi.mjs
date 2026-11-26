// Mengambil katalog data resmi (CKAN) dari portal pemerintah ke tabel data_resmi di Supabase.
// Hanya metadata (judul, penerbit, tanggal, tautan). Isi data tetap di situs sumber.
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY. Opsional: DRY_RUN=1
const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
const DRY = process.env.DRY_RUN === '1';
if (!DRY && (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)) { console.error('Env Supabase belum diisi'); process.exit(1); }

// Portal CKAN. Tambah baris baru di sini untuk menambah sumber.
const PORTALS = [
  { id: 'satudata', base: 'https://katalog.satudata.go.id', wilayah: 'Indonesia' },
  { id: 'jateng', base: 'https://data.jatengprov.go.id', wilayah: 'Jawa Tengah' },
  { id: 'kaltim', base: 'https://data.kaltimprov.go.id', wilayah: 'Kalimantan Timur' },
  { id: 'demak', base: 'https://data.demakkab.go.id', wilayah: 'Kabupaten Demak, Jawa Tengah' },
];
const TERMS = ['mangrove', 'terumbu karang', 'lamun', 'padang lamun', 'ekosistem pesisir', 'rehabilitasi mangrove', 'konservasi pesisir', 'wisata bahari', 'abrasi'];
const strip = (s) => (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500);

const sb = (path, init = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
});

async function ckan(portal, term, start) {
  const u = new URL(`${portal.base}/api/3/action/package_search`);
  u.searchParams.set('q', term); u.searchParams.set('rows', '100'); u.searchParams.set('start', String(start));
  let err;
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'PustakaMangroveARK/1.0 (+katalog data terbuka)' }, signal: AbortSignal.timeout(30000) });
      if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (!j.success) throw new Error('CKAN success=false');
      return j.result;
    } catch (e) { err = e; if (/HTTP 4/.test(e.message)) break; await new Promise((ok) => setTimeout(ok, 2000 * (k + 1))); }
  }
  throw err;
}

function toRow(portal, p) {
  const res = p.resources || [];
  const fmts = [...new Set(res.map((x) => (x.format || '').toUpperCase()).filter(Boolean))];
  const first = res.find((x) => x.url);
  return {
    sumber: portal.id,
    sumber_id: p.id,
    judul: strip(p.title) || p.name || '(tanpa judul)',
    deskripsi: strip(p.notes),
    organisasi: p.organization?.title || p.author || null,
    wilayah: portal.wilayah,
    tema: (p.groups || []).map((g) => g.title).join(', ') || null,
    format: fmts,
    tautan: `${portal.base}/dataset/${p.name || p.id}`,
    tautan_data: first?.url || null,
    diperbarui: p.metadata_modified || null,
  };
}

async function main() {
  let total = 0, gagal = 0;
  for (const portal of PORTALS) {
    const seen = new Map();
    for (const term of TERMS) {
      try {
        for (let start = 0; start < 300; start += 100) {
          const res = await ckan(portal, term, start);
          for (const p of res.results || []) seen.set(p.id, toRow(portal, p));
          if (start + 100 >= (res.count || 0)) break;
        }
      } catch (e) { gagal++; console.warn(`[${portal.id}] "${term}" gagal: ${e.message}`); }
    }
    const rows = [...seen.values()];
    console.log(`[${portal.id}] ${rows.length} dataset unik`);
    if (DRY) { if (rows[0]) console.log('Contoh:', JSON.stringify(rows[0]).slice(0, 600)); continue; }
    for (let i = 0; i < rows.length; i += 100) {
      const up = await sb('data_resmi?on_conflict=sumber,sumber_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, i + 100)) });
      if (!up.ok) { console.error('Supabase', up.status, (await up.text()).slice(0, 300)); process.exit(1); }
    }
    total += rows.length;
  }
  console.log(`Selesai. ${total} dataset disimpan, ${gagal} kueri gagal.`);
}
main();
