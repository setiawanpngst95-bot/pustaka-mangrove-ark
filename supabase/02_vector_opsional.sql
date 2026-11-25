-- OPSIONAL, jalankan nanti setelah pencarian teks berjalan baik.
-- 1024 dimensi = bge-m3. halfvec memakai separuh ruang; pastikan didukung versi pgvector proyek Anda.
create extension if not exists vector with schema extensions;
alter table works add column if not exists embedding extensions.halfvec(1024);
create index if not exists works_embedding_idx on works using hnsw (embedding extensions.halfvec_cosine_ops);
