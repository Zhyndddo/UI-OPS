-- Round 390 — "prepare to add an automatic magic link rewrite or create
-- token like so. Use DID for token of the magiclink; or use the name +
-- main artist first letter for the token" (booking magic link —
-- /pick-package/[token], the magic_links table).
--
-- Investigated first: magic_links.token currently defaults to
-- generate_base36_token() — a fully opaque random 25-char string, no
-- relation to the release it points at. Separately, releases already has
-- a `did` column (set_release_did() trigger, defined above this file in
-- the schema) that's EXACTLY the "name + main artist first letter" idea
-- the request floated, just already built out further: title-initials +
-- artist-initials + release-date + a sequence number
-- (e.g. "SVMT-25122026-0001"), and already guaranteed unique
-- (releases_did_key). Per the user's own condition — "if yes go with
-- did[, it's easy]. if no go with the other but add some gate so same
-- song (but different version) won't be bugged out" — did already
-- carries that gate for free: two releases of "the same song" (a remix,
-- a re-release) get different release_date/sequence parts and therefore
-- different DIDs automatically, so this doesn't need the collision
-- handling a bare "title-initial + artist-initial" token would have
-- needed. That's what makes DID the easy path.
--
-- Scope, per explicit answer: NEW links only — every magic_links row
-- that already exists keeps its current opaque token untouched, so any
-- link already sent to an artist/vendor/label contact keeps working.
-- This migration only changes what token gets minted going forward.
-- Also per explicit answer: magic_links only, not
-- channel_reference_share_links / performance_share_links.
--
-- Mirrors set_release_did()'s own "if new.did is not null then return
-- new -- allow manual override" idiom, for the same reason: lets a
-- manually-inserted/seeded token (tests, future admin tooling) still
-- pass straight through untouched.
--
-- One real wrinkle DID introduces that the old random token never had:
-- "Generate Link" (app/tickets/media-booking/page.js's handleGenerateLink)
-- can be clicked more than once for the same release, minting a second
-- magic_links row — with the old random default that's harmless (each
-- row gets its own fresh random token), but a bare release DID is fixed
-- per release, so a second insert for the same release would collide
-- with magic_links_token_key. Handled below with a simple -2/-3/...
-- suffix loop, so re-generating a link never fails; the first (most
-- common) link for a release still gets the clean bare DID with no
-- suffix.
--
-- Second wrinkle: _field_initials() (used by set_release_did) emits '#'
-- as a placeholder when a title/artist is a single word or that word
-- contains a hyphen — common enough in Vietnamese titles/stage names.
-- '#' is the one character that's actively dangerous to leave in a URL
-- PATH segment (it's the browser's fragment delimiter — a raw,
-- un-percent-encoded "#" pasted into an address bar or a chat client
-- that doesn't encode links truncates the URL right there, so
-- "/pick-package/AB#C-..." silently becomes "/pick-package/AB" plus a
-- dead-weight fragment). Swapped to "x" for the TOKEN only — the
-- release's own `did` column is left exactly as set_release_did()
-- produces it; this is a display/URL-safety substitution on the copy
-- magic_links.token gets, nothing upstream changes.
create or replace function public.set_magic_link_token() returns trigger
    language plpgsql
    as $$
declare
  base_token text;
  candidate  text;
  suffix     int := 1;
begin
  if new.token is not null then
    return new;  -- allow manual override, e.g. seeded/test rows
  end if;

  select did into base_token from releases where id = new.release_id;

  if base_token is null then
    -- Shouldn't normally happen (did is auto-filled on release insert),
    -- but fall back to the old opaque scheme rather than hard-failing
    -- link generation if it ever does.
    new.token := generate_base36_token();
    return new;
  end if;

  base_token := replace(base_token, '#', 'x');

  candidate := base_token;
  while exists (select 1 from magic_links where token = candidate) loop
    suffix := suffix + 1;
    candidate := base_token || '-' || suffix;
  end loop;

  new.token := candidate;
  return new;
end;
$$;

drop trigger if exists trg_set_magic_link_token on magic_links;
create trigger trg_set_magic_link_token
  before insert on magic_links
  for each row execute function set_magic_link_token();

-- The column default is what currently fills the token when the app
-- inserts a bare {release_id: ...} row (see handleGenerateLink in
-- app/tickets/media-booking/page.js — it never passes a token itself).
-- A column default runs BEFORE triggers see the row, so as long as it's
-- still generate_base36_token() the trigger above would only ever see a
-- non-null new.token and its "allow manual override" branch would take
-- over every single insert, silently keeping the OLD scheme forever.
-- Dropping the default is what actually hands control to the trigger —
-- app code needs no changes, since it already never passes a token
-- explicitly.
alter table magic_links alter column token drop default;

-- No app code changes needed anywhere: token generation was already
-- 100% server-side (the app only ever does
-- `.from("magic_links").insert({ release_id }).select("token")`), and
-- /pick-package/[token]/page.js's lookup is a plain `.eq("token", token)`
-- with no format assumption (length, charset) to break.
