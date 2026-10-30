-- Re-send saved Halloween drawings (halloween_drawings with no Drive link) to Google Drive straight from SQL.
-- Needs the Apps Script web app to be working (new version deployed, access = Anyone). No code push needed.
-- SECURITY: this puts your secret in the SQL editor history. After you are done, change SECRET in the script
-- (deploy a New version) and in Vercel, or just never reuse it.

-- STEP 0 (once): the extension that lets the database call a web address (Supabase has it built in)
create extension if not exists pg_net;

-- STEP 1: see what is waiting (read-only)
select id, day, name, won, practice, length(png_b64) as png_chars, created_at
from halloween_drawings where drive_url is null and png_b64 is not null order by created_at;

-- STEP 2: send. Paste your two values below. It sends ONE drawing first (limit 1) so you can look in Drive.
--         Happy? change `limit 1` to `limit 40` and run it again (the first one will be sent twice, delete the copy in Drive).
do $$
declare
  r record;
  v_url    text := 'PASTE_WEB_APP_URL_ENDING_IN_/exec';
  v_secret text := 'PASTE_THE_SAME_SECRET_AS_IN_THE_SCRIPT';
begin
  for r in
    select id, day, name, won, practice, png_b64 from halloween_drawings
    where drive_url is null and png_b64 is not null order by won desc, created_at limit 1
  loop
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object(
        'secret', v_secret,
        'filename', r.day || '_' || case when r.won then 'WINNER_' else '' end || case when r.practice then 'TEST_' else '' end
                    || trim(both '-' from regexp_replace(coalesce(r.name, 'player'), '[^A-Za-z0-9]+', '-', 'g')) || '_' || left(r.id::text, 6) || '.png',
        'mimeType', 'image/png',
        'dataBase64', r.png_b64),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds := 20000);
  end loop;
end $$;

-- STEP 3: look in the Drive folder (give it a few seconds). The database call is asynchronous, so it cannot tell you success;
--         the answer from the web address is here (302 is NORMAL for Apps Script; 4xx/5xx or an error_msg = a problem):
select id, status_code, error_msg, created from net._http_response order by created desc limit 5;

-- STEP 4: once the pictures are in Drive, mark them so they are not sent again
-- update halloween_drawings set drive_url = 'resent-by-sql' where drive_url is null and png_b64 is not null;
