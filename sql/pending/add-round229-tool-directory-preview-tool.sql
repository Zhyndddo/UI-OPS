-- Round 229 — safety net for adding "New Release Preview" as a real tool
-- entry in the `upload` bucket of lib/toolDirectory.js's tool directory
-- (alongside Label Master and Linkfire).
--
-- mergeToolDirectory() (lib/toolDirectory.js) uses a saved bucket's
-- `tools` array WHOLESALE once any dev has ever saved it through the
-- Tools Directory page's edit mode (app/tool-directory/page.js) — the
-- new default third tool added in the app code will silently NOT show
-- up in that case, since the saved JSON in app_settings simply doesn't
-- know about it yet.
--
-- This migration only matters if the `upload` bucket was ever saved
-- that way. If it was never saved (still running on the code defaults),
-- this is a no-op — the WHERE clause below only matches a row that
-- exists and only appends when the tool isn't already present, so it's
-- safe to run regardless, and safe to run more than once.

update app_settings
set value = jsonb_set(
  value,
  '{upload,tools}',
  (value -> 'upload' -> 'tools') || '[{"key":"newReleasePreview","label":"New Release Preview","generator":"newReleasePreviewNote"}]'::jsonb
)
where key = 'tool_directory_links'
  and value ? 'upload'
  and value -> 'upload' ? 'tools'
  and not exists (
    select 1
    from jsonb_array_elements(value -> 'upload' -> 'tools') t
    where t ->> 'key' = 'newReleasePreview'
  );
