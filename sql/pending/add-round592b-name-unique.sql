-- ============================================================================
-- Round 592 (step 2 of 2) — hard unique rule on artist / label names
-- ============================================================================
-- Run ONLY after add-round592-name-dedupe.sql AND after the two duplicate CHECK queries in it return no rows
-- (otherwise the index creation fails with "could not create unique index" and nothing changes — harmless).
-- Undo:  drop index if exists public.uq_artists_norm_name; drop index if exists public.uq_labels_norm_name;

create unique index if not exists uq_artists_norm_name on public.artists (public.norm_name(stage_name));
create unique index if not exists uq_labels_norm_name  on public.labels  (public.norm_label(label_name));
