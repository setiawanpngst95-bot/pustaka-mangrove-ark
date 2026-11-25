-- Pustaka Mangrove ARK: skema dasar. Jalankan di Supabase > SQL Editor.

create table if not exists data_sources (
  id text primary key,
  name text not null,
  url text,
  license text,
  last_updated date
);

create table if not exists works (
  id bigint generated always as identity primary key,
  openalex_id text unique not null,
  doi text,
  title text not null,
  abstract text,                 -- hanya diisi bila lisensi terbuka (lihat ingest.mjs)
  year int,
  language text,
  work_type text,
  venue text,
  oa_status text,
  oa_url text,
  landing_url text,
  license text,
  topics text[] default '{}',
  country_codes text[] default '{}',
  query_tag text,
  created_at timestamptz default now(),
  tsv tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(abstract,'')), 'B')
  ) stored
);
create index if not exists works_tsv_idx on works using gin (tsv);
create index if not exists works_year_idx on works (year);
create index if not exists works_doi_idx on works (doi);

create table if not exists regions (
  id bigint generated always as identity primary key,
  kind text not null,            -- negara | provinsi | kabupaten
  name text not null,
  parent_id bigint references regions(id)
);

create table if not exists work_regions (
  work_id bigint references works(id) on delete cascade,
  region_id bigint references regions(id) on delete cascade,
  primary key (work_id, region_id)
);

create table if not exists region_stats (
  id bigint generated always as identity primary key,
  region_id bigint references regions(id) on delete cascade,
  metric text not null,          -- luas_mangrove | stok_karbon | luas_karang
  value numeric not null,
  unit text not null,
  year int,
  source_id text references data_sources(id),
  note text
);

create table if not exists reading_lists (
  id bigint generated always as identity primary key,
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);
create table if not exists reading_list_items (
  list_id bigint references reading_lists(id) on delete cascade,
  work_id bigint references works(id) on delete cascade,
  added_at timestamptz default now(),
  primary key (list_id, work_id)
);

create table if not exists ingest_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz default now(),
  finished_at timestamptz,
  since_date date,
  fetched int default 0,
  stored int default 0,
  error text
);

create table if not exists ask_log (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  n_sources int,
  answered boolean,
  flagged_wrong boolean default false
);

-- Aturan akses (RLS)
alter table data_sources enable row level security;
alter table works enable row level security;
alter table regions enable row level security;
alter table work_regions enable row level security;
alter table region_stats enable row level security;
alter table reading_lists enable row level security;
alter table reading_list_items enable row level security;
alter table ingest_runs enable row level security;
alter table ask_log enable row level security;

create policy "baca publik" on data_sources for select using (true);
create policy "baca publik" on works for select using (true);
create policy "baca publik" on regions for select using (true);
create policy "baca publik" on work_regions for select using (true);
create policy "baca publik" on region_stats for select using (true);

create policy "daftar milik sendiri" on reading_lists for all
  using (owner = auth.uid()) with check (owner = auth.uid());
create policy "isi daftar milik sendiri" on reading_list_items for all
  using (exists (select 1 from reading_lists l where l.id = list_id and l.owner = auth.uid()))
  with check (exists (select 1 from reading_lists l where l.id = list_id and l.owner = auth.uid()));
-- ingest_runs dan ask_log: tanpa kebijakan = hanya kunci layanan (server) yang bisa menulis/membaca.

-- Fungsi pencarian teks (dipanggil Worker lewat RPC)
create or replace function cari_literatur(q text, tahun_min int default null, hanya_oa boolean default false, batas int default 20)
returns table (id bigint, title text, abstract text, year int, venue text, oa_status text, oa_url text, landing_url text, doi text, rank real)
language sql stable as $$
  select w.id, w.title, w.abstract, w.year, w.venue, w.oa_status, w.oa_url, w.landing_url, w.doi,
         ts_rank(w.tsv, websearch_to_tsquery('simple', q)) as rank
  from works w
  where w.tsv @@ websearch_to_tsquery('simple', q)
    and (tahun_min is null or w.year >= tahun_min)
    and (not hanya_oa or w.oa_status in ('gold','green','hybrid','bronze','diamond'))
  order by rank desc, w.year desc
  limit least(batas, 50);
$$;
