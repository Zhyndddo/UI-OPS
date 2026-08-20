--
-- PostgreSQL database dump
--

\restrict 94Sh9oioCtXS3kvMParWMfdWWvysQRy5igcWSbQTRdyIhhPItM3zhTMQZtDXgn3

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.workstation_assignments DROP CONSTRAINT IF EXISTS workstation_assignments_release_id_fkey;
ALTER TABLE IF EXISTS ONLY public.workstation_assignments DROP CONSTRAINT IF EXISTS workstation_assignments_pic_profile_id_fkey;
ALTER TABLE IF EXISTS ONLY public.tickets DROP CONSTRAINT IF EXISTS tickets_tab_id_fkey;
ALTER TABLE IF EXISTS ONLY public.tickets DROP CONSTRAINT IF EXISTS tickets_pic_profile_id_fkey;
ALTER TABLE IF EXISTS ONLY public.team_building_survey_responses DROP CONSTRAINT IF EXISTS team_building_survey_responses_profile_id_fkey;
ALTER TABLE IF EXISTS ONLY public.releases DROP CONSTRAINT IF EXISTS releases_pitching_pic_spotify_fkey;
ALTER TABLE IF EXISTS ONLY public.releases DROP CONSTRAINT IF EXISTS releases_pitching_pic_spotify_banner_fkey;
ALTER TABLE IF EXISTS ONLY public.releases DROP CONSTRAINT IF EXISTS releases_pitching_pic_priority_fkey;
ALTER TABLE IF EXISTS ONLY public.releases DROP CONSTRAINT IF EXISTS releases_pitching_pic_domestic_fkey;
ALTER TABLE IF EXISTS ONLY public.releases DROP CONSTRAINT IF EXISTS releases_pitching_pic_apple_fkey;
ALTER TABLE IF EXISTS ONLY public.release_tracks DROP CONSTRAINT IF EXISTS release_tracks_release_id_fkey;
ALTER TABLE IF EXISTS ONLY public.release_stream_metrics DROP CONSTRAINT IF EXISTS release_stream_metrics_release_id_fkey;
ALTER TABLE IF EXISTS ONLY public.release_package_items DROP CONSTRAINT IF EXISTS release_package_items_release_id_fkey;
ALTER TABLE IF EXISTS ONLY public.release_dsp_links DROP CONSTRAINT IF EXISTS release_dsp_links_release_id_fkey;
ALTER TABLE IF EXISTS ONLY public.profiles DROP CONSTRAINT IF EXISTS profiles_auth_id_fkey;
ALTER TABLE IF EXISTS ONLY public.phai_sinh_batch_items DROP CONSTRAINT IF EXISTS phai_sinh_batch_items_pic_profile_id_fkey;
ALTER TABLE IF EXISTS ONLY public.phai_sinh_batch_items DROP CONSTRAINT IF EXISTS phai_sinh_batch_items_batch_ticket_id_fkey;
ALTER TABLE IF EXISTS ONLY public.notifications DROP CONSTRAINT IF EXISTS notifications_ticket_id_fkey;
ALTER TABLE IF EXISTS ONLY public.notifications DROP CONSTRAINT IF EXISTS notifications_profile_id_fkey;
ALTER TABLE IF EXISTS ONLY public.media_booking_packages DROP CONSTRAINT IF EXISTS media_booking_packages_release_id_fkey;
ALTER TABLE IF EXISTS ONLY public.media_booking_package_lines DROP CONSTRAINT IF EXISTS media_booking_package_lines_package_id_fkey;
ALTER TABLE IF EXISTS ONLY public.media_booking_package_lines DROP CONSTRAINT IF EXISTS media_booking_package_lines_category_id_fkey;
ALTER TABLE IF EXISTS ONLY public.media_booking_package_categories DROP CONSTRAINT IF EXISTS media_booking_package_categories_release_id_fkey;
ALTER TABLE IF EXISTS ONLY public.media_booking_package_categories DROP CONSTRAINT IF EXISTS media_booking_package_categories_category_id_fkey;
ALTER TABLE IF EXISTS ONLY public.media_booking_entries DROP CONSTRAINT IF EXISTS media_booking_entries_release_id_fkey;
ALTER TABLE IF EXISTS ONLY public.media_booking_entries DROP CONSTRAINT IF EXISTS media_booking_entries_category_id_fkey;
ALTER TABLE IF EXISTS ONLY public.media_booking_dot2_targets DROP CONSTRAINT IF EXISTS media_booking_dot2_targets_release_id_fkey;
ALTER TABLE IF EXISTS ONLY public.media_booking_dot2_targets DROP CONSTRAINT IF EXISTS media_booking_dot2_targets_category_id_fkey;
ALTER TABLE IF EXISTS ONLY public.media_booking_content_entries DROP CONSTRAINT IF EXISTS media_booking_content_entries_release_id_fkey;
ALTER TABLE IF EXISTS ONLY public.media_booking_content_entries DROP CONSTRAINT IF EXISTS media_booking_content_entries_channel_id_fkey;
ALTER TABLE IF EXISTS ONLY public.media_booking_content_entries DROP CONSTRAINT IF EXISTS media_booking_content_entries_category_id_fkey;
ALTER TABLE IF EXISTS ONLY public.media_booking_channel_status DROP CONSTRAINT IF EXISTS media_booking_channel_status_release_id_fkey;
ALTER TABLE IF EXISTS ONLY public.media_booking_channel_status DROP CONSTRAINT IF EXISTS media_booking_channel_status_category_id_fkey;
ALTER TABLE IF EXISTS ONLY public.magic_links DROP CONSTRAINT IF EXISTS magic_links_release_id_fkey;
ALTER TABLE IF EXISTS ONLY public.labels DROP CONSTRAINT IF EXISTS labels_parent_label_id_fkey;
ALTER TABLE IF EXISTS ONLY public.entity_fields DROP CONSTRAINT IF EXISTS entity_fields_group_id_fkey;
ALTER TABLE IF EXISTS ONLY public.dsp_metrics_snapshots DROP CONSTRAINT IF EXISTS dsp_metrics_snapshots_dsp_link_id_fkey;
ALTER TABLE IF EXISTS ONLY public.design_types DROP CONSTRAINT IF EXISTS design_types_platform_id_fkey;
ALTER TABLE IF EXISTS ONLY public.design_sizes DROP CONSTRAINT IF EXISTS design_sizes_design_type_id_fkey;
ALTER TABLE IF EXISTS ONLY public.artists DROP CONSTRAINT IF EXISTS artists_label_id_fkey;
DROP TRIGGER IF EXISTS trg_set_release_did ON public.releases;
DROP TRIGGER IF EXISTS trg_set_published_at ON public.releases;
DROP TRIGGER IF EXISTS trg_prevent_duplicate_media_booking ON public.tickets;
DROP TRIGGER IF EXISTS trg_notify_on_ticket_insert ON public.tickets;
DROP TRIGGER IF EXISTS trg_notify_on_ticket_complete ON public.tickets;
DROP TRIGGER IF EXISTS trg_default_field_group ON public.entity_fields;
DROP INDEX IF EXISTS public.uq_workstation_override;
DROP INDEX IF EXISTS public.uq_workstation_default;
DROP INDEX IF EXISTS public.uq_one_other_group_per_entity;
DROP INDEX IF EXISTS public.idx_workstation_assignments_pic;
DROP INDEX IF EXISTS public.idx_tickets_lookup;
DROP INDEX IF EXISTS public.idx_releases_main_artist_tags;
DROP INDEX IF EXISTS public.idx_releases_feature_artist_tags;
DROP INDEX IF EXISTS public.idx_release_tracks_lookup;
DROP INDEX IF EXISTS public.idx_release_package_items_lookup;
DROP INDEX IF EXISTS public.idx_phai_sinh_batch_items_batch;
DROP INDEX IF EXISTS public.idx_notifications_recipient;
DROP INDEX IF EXISTS public.idx_milestone_roster_lookup;
DROP INDEX IF EXISTS public.idx_milestone_lookup;
DROP INDEX IF EXISTS public.idx_media_booking_lookup;
DROP INDEX IF EXISTS public.idx_media_booking_category;
DROP INDEX IF EXISTS public.idx_mb_package_lines_lookup;
DROP INDEX IF EXISTS public.idx_mb_content_entries_lookup;
DROP INDEX IF EXISTS public.idx_magic_links_release;
DROP INDEX IF EXISTS public.idx_lookup_options_category;
DROP INDEX IF EXISTS public.idx_dsp_metrics_lookup;
DROP INDEX IF EXISTS public.idx_audit_log_lookup;
DROP INDEX IF EXISTS public.idx_artists_stage_name;
DROP INDEX IF EXISTS public.idx_artists_label_id;
ALTER TABLE IF EXISTS ONLY public.workstation_assignments DROP CONSTRAINT IF EXISTS workstation_assignments_pkey;
ALTER TABLE IF EXISTS ONLY public.tickets DROP CONSTRAINT IF EXISTS tickets_pkey;
ALTER TABLE IF EXISTS ONLY public.tickets DROP CONSTRAINT IF EXISTS tickets_legacy_id_key;
ALTER TABLE IF EXISTS ONLY public.ticket_tabs DROP CONSTRAINT IF EXISTS ticket_tabs_pkey;
ALTER TABLE IF EXISTS ONLY public.ticket_tabs DROP CONSTRAINT IF EXISTS ticket_tabs_key_key;
ALTER TABLE IF EXISTS ONLY public.team_building_survey_responses DROP CONSTRAINT IF EXISTS team_building_survey_responses_profile_id_key;
ALTER TABLE IF EXISTS ONLY public.team_building_survey_responses DROP CONSTRAINT IF EXISTS team_building_survey_responses_pkey;
ALTER TABLE IF EXISTS ONLY public.releases DROP CONSTRAINT IF EXISTS releases_pkey;
ALTER TABLE IF EXISTS ONLY public.releases DROP CONSTRAINT IF EXISTS releases_legacy_id_key;
ALTER TABLE IF EXISTS ONLY public.releases DROP CONSTRAINT IF EXISTS releases_did_key;
ALTER TABLE IF EXISTS ONLY public.release_tracks DROP CONSTRAINT IF EXISTS release_tracks_pkey;
ALTER TABLE IF EXISTS ONLY public.release_stream_metrics DROP CONSTRAINT IF EXISTS release_stream_metrics_release_id_key;
ALTER TABLE IF EXISTS ONLY public.release_stream_metrics DROP CONSTRAINT IF EXISTS release_stream_metrics_pkey;
ALTER TABLE IF EXISTS ONLY public.release_package_items DROP CONSTRAINT IF EXISTS release_package_items_pkey;
ALTER TABLE IF EXISTS ONLY public.release_dsp_links DROP CONSTRAINT IF EXISTS release_dsp_links_release_id_platform_key;
ALTER TABLE IF EXISTS ONLY public.release_dsp_links DROP CONSTRAINT IF EXISTS release_dsp_links_pkey;
ALTER TABLE IF EXISTS ONLY public.profiles DROP CONSTRAINT IF EXISTS profiles_pkey;
ALTER TABLE IF EXISTS ONLY public.profiles DROP CONSTRAINT IF EXISTS profiles_email_key;
ALTER TABLE IF EXISTS ONLY public.profiles DROP CONSTRAINT IF EXISTS profiles_auth_id_key;
ALTER TABLE IF EXISTS ONLY public.phai_sinh_batch_items DROP CONSTRAINT IF EXISTS phai_sinh_batch_items_pkey;
ALTER TABLE IF EXISTS ONLY public.package_categories DROP CONSTRAINT IF EXISTS package_categories_pkey;
ALTER TABLE IF EXISTS ONLY public.package_categories DROP CONSTRAINT IF EXISTS package_categories_name_key;
ALTER TABLE IF EXISTS ONLY public.notifications DROP CONSTRAINT IF EXISTS notifications_pkey;
ALTER TABLE IF EXISTS ONLY public.notification_settings DROP CONSTRAINT IF EXISTS notification_settings_pkey;
ALTER TABLE IF EXISTS ONLY public.milestone_chart_roster DROP CONSTRAINT IF EXISTS milestone_chart_roster_platform_chart_track_title_artist_key;
ALTER TABLE IF EXISTS ONLY public.milestone_chart_roster DROP CONSTRAINT IF EXISTS milestone_chart_roster_pkey;
ALTER TABLE IF EXISTS ONLY public.milestone_chart_entries DROP CONSTRAINT IF EXISTS milestone_chart_entries_pkey;
ALTER TABLE IF EXISTS ONLY public.milestone_chart_entries DROP CONSTRAINT IF EXISTS milestone_chart_entries_chart_track_title_artist_entry_date_key;
ALTER TABLE IF EXISTS ONLY public.media_booking_packages DROP CONSTRAINT IF EXISTS media_booking_packages_pkey;
ALTER TABLE IF EXISTS ONLY public.media_booking_package_lines DROP CONSTRAINT IF EXISTS media_booking_package_lines_pkey;
ALTER TABLE IF EXISTS ONLY public.media_booking_package_categories DROP CONSTRAINT IF EXISTS media_booking_package_categories_pkey;
ALTER TABLE IF EXISTS ONLY public.media_booking_package_categories DROP CONSTRAINT IF EXISTS media_booking_package_categori_release_id_category_id_brand_key;
ALTER TABLE IF EXISTS ONLY public.media_booking_entries DROP CONSTRAINT IF EXISTS media_booking_entries_pkey;
ALTER TABLE IF EXISTS ONLY public.media_booking_dot2_targets DROP CONSTRAINT IF EXISTS media_booking_dot2_targets_release_id_category_id_key;
ALTER TABLE IF EXISTS ONLY public.media_booking_dot2_targets DROP CONSTRAINT IF EXISTS media_booking_dot2_targets_pkey;
ALTER TABLE IF EXISTS ONLY public.media_booking_content_entries DROP CONSTRAINT IF EXISTS media_booking_content_entries_pkey;
ALTER TABLE IF EXISTS ONLY public.media_booking_channel_status DROP CONSTRAINT IF EXISTS media_booking_channel_status_release_id_category_id_brand_c_key;
ALTER TABLE IF EXISTS ONLY public.media_booking_channel_status DROP CONSTRAINT IF EXISTS media_booking_channel_status_pkey;
ALTER TABLE IF EXISTS ONLY public.magic_links DROP CONSTRAINT IF EXISTS magic_links_token_key;
ALTER TABLE IF EXISTS ONLY public.magic_links DROP CONSTRAINT IF EXISTS magic_links_pkey;
ALTER TABLE IF EXISTS ONLY public.lookup_options DROP CONSTRAINT IF EXISTS lookup_options_pkey;
ALTER TABLE IF EXISTS ONLY public.lookup_options DROP CONSTRAINT IF EXISTS lookup_options_category_value_key;
ALTER TABLE IF EXISTS ONLY public.labels DROP CONSTRAINT IF EXISTS labels_pkey;
ALTER TABLE IF EXISTS ONLY public.global_settings DROP CONSTRAINT IF EXISTS global_settings_pkey;
ALTER TABLE IF EXISTS ONLY public.entity_fields DROP CONSTRAINT IF EXISTS entity_fields_pkey;
ALTER TABLE IF EXISTS ONLY public.entity_fields DROP CONSTRAINT IF EXISTS entity_fields_entity_type_field_key_key;
ALTER TABLE IF EXISTS ONLY public.entity_field_groups DROP CONSTRAINT IF EXISTS entity_field_groups_pkey;
ALTER TABLE IF EXISTS ONLY public.entity_field_groups DROP CONSTRAINT IF EXISTS entity_field_groups_entity_type_key_key;
ALTER TABLE IF EXISTS ONLY public.dsp_metrics_snapshots DROP CONSTRAINT IF EXISTS dsp_metrics_snapshots_pkey;
ALTER TABLE IF EXISTS ONLY public.design_types DROP CONSTRAINT IF EXISTS design_types_platform_id_name_key;
ALTER TABLE IF EXISTS ONLY public.design_types DROP CONSTRAINT IF EXISTS design_types_pkey;
ALTER TABLE IF EXISTS ONLY public.design_sizes DROP CONSTRAINT IF EXISTS design_sizes_pkey;
ALTER TABLE IF EXISTS ONLY public.design_platforms DROP CONSTRAINT IF EXISTS design_platforms_pkey;
ALTER TABLE IF EXISTS ONLY public.design_platforms DROP CONSTRAINT IF EXISTS design_platforms_name_key;
ALTER TABLE IF EXISTS ONLY public.contract_type_packages DROP CONSTRAINT IF EXISTS contract_type_packages_pkey;
ALTER TABLE IF EXISTS ONLY public.contract_type_packages DROP CONSTRAINT IF EXISTS contract_type_packages_contract_type_key;
ALTER TABLE IF EXISTS ONLY public.booking_channels DROP CONSTRAINT IF EXISTS booking_channels_pkey;
ALTER TABLE IF EXISTS ONLY public.booking_channels DROP CONSTRAINT IF EXISTS booking_channels_name_platform_channel_type_key;
ALTER TABLE IF EXISTS ONLY public.audit_log DROP CONSTRAINT IF EXISTS audit_log_pkey;
ALTER TABLE IF EXISTS ONLY public.artists DROP CONSTRAINT IF EXISTS artists_pkey;
ALTER TABLE IF EXISTS ONLY public.app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
DROP TABLE IF EXISTS public.workstation_assignments;
DROP TABLE IF EXISTS public.tickets;
DROP TABLE IF EXISTS public.ticket_tabs;
DROP TABLE IF EXISTS public.team_building_survey_responses;
DROP TABLE IF EXISTS public.release_tracks;
DROP TABLE IF EXISTS public.release_stream_metrics;
DROP TABLE IF EXISTS public.release_package_items;
DROP TABLE IF EXISTS public.release_dsp_links;
DROP SEQUENCE IF EXISTS public.release_did_seq;
DROP TABLE IF EXISTS public.profiles;
DROP TABLE IF EXISTS public.phai_sinh_batch_items;
DROP TABLE IF EXISTS public.package_categories;
DROP TABLE IF EXISTS public.notifications;
DROP TABLE IF EXISTS public.notification_settings;
DROP VIEW IF EXISTS public.milestone_rank_history;
DROP TABLE IF EXISTS public.milestone_chart_roster;
DROP TABLE IF EXISTS public.milestone_chart_entries;
DROP TABLE IF EXISTS public.media_booking_packages;
DROP TABLE IF EXISTS public.media_booking_package_lines;
DROP TABLE IF EXISTS public.media_booking_package_categories;
DROP TABLE IF EXISTS public.media_booking_entries;
DROP TABLE IF EXISTS public.media_booking_dot2_targets;
DROP TABLE IF EXISTS public.media_booking_content_entries;
DROP TABLE IF EXISTS public.media_booking_channel_status;
DROP TABLE IF EXISTS public.magic_links;
DROP TABLE IF EXISTS public.lookup_options;
DROP TABLE IF EXISTS public.labels;
DROP TABLE IF EXISTS public.global_settings;
DROP TABLE IF EXISTS public.entity_fields;
DROP TABLE IF EXISTS public.entity_field_groups;
DROP TABLE IF EXISTS public.dsp_metrics_snapshots;
DROP TABLE IF EXISTS public.design_types;
DROP TABLE IF EXISTS public.design_sizes;
DROP TABLE IF EXISTS public.design_platforms;
DROP TABLE IF EXISTS public.contract_type_packages;
DROP TABLE IF EXISTS public.booking_channels;
DROP TABLE IF EXISTS public.audit_log;
DROP TABLE IF EXISTS public.artists;
DROP TABLE IF EXISTS public.app_settings;
DROP FUNCTION IF EXISTS public.set_release_did();
DROP FUNCTION IF EXISTS public.set_published_at();
DROP FUNCTION IF EXISTS public.publishing_status(r public.releases);
DROP FUNCTION IF EXISTS public.prevent_duplicate_media_booking();
DROP FUNCTION IF EXISTS public.phu_luc_status(r public.releases);
DROP FUNCTION IF EXISTS public.notify_on_ticket_insert();
DROP FUNCTION IF EXISTS public.notify_on_ticket_complete();
DROP FUNCTION IF EXISTS public.needs_phu_luc(r public.releases);
DROP TABLE IF EXISTS public.releases;
DROP FUNCTION IF EXISTS public.milestone_roster_nightly_reset();
DROP FUNCTION IF EXISTS public.generate_base36_token(byte_length integer, pad_length integer);
DROP FUNCTION IF EXISTS public.flag_overdue_batch_items();
DROP FUNCTION IF EXISTS public.fanout_notification(p_team text, p_type text, p_title text, p_body text, p_link text, p_ticket_id uuid);
DROP FUNCTION IF EXISTS public.design_scheduled_sweep(p_include_late boolean);
DROP FUNCTION IF EXISTS public.default_field_group();
DROP FUNCTION IF EXISTS public._field_initials(field text);
DROP SCHEMA IF EXISTS public;
--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: _field_initials(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._field_initials(field text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  words  text[];
  w1     text;
  w2     text;
  result text := '';
begin
  words := array_remove(regexp_split_to_array(trim(coalesce(field, '')), '\s+'), '');
  w1 := words[1];
  w2 := words[2];

  if w1 is null or position('-' in w1) > 0 then
    result := result || '#';
  else
    result := result || upper(substring(w1 from 1 for 1));
  end if;

  if w2 is null or position('-' in w2) > 0 then
    result := result || '#';
  else
    result := result || upper(substring(w2 from 1 for 1));
  end if;

  return result;
end;
$$;


--
-- Name: default_field_group(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.default_field_group() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.group_id is null then
    select id into new.group_id from entity_field_groups
      where entity_type = new.entity_type and is_other limit 1;
  end if;
  return new;
end;
$$;


--
-- Name: design_scheduled_sweep(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.design_scheduled_sweep(p_include_late boolean DEFAULT false) RETURNS void
    LANGUAGE plpgsql
    AS $$
declare
  templates jsonb;
  design_tab_id uuid;
  waiting_count int;
  late_count int;
  pending_revise_count int;
  target_id uuid;
  body text;
begin
  select value into templates from app_settings where key = 'design_notification_templates';
  select id into design_tab_id from ticket_tabs where key = 'design';
  if design_tab_id is null then
    return;
  end if;

  select count(*) into waiting_count from tickets
    where tab_id = design_tab_id and deleted_at is null and status = 'REQUEST';

  if waiting_count > 0 then
    body := replace(coalesce(templates->>'reminder', '{count} Design request(s) waiting.'), '{count}', waiting_count::text);
    for target_id in
      select id from profiles where segment = 'Design'
      union
      select id from profiles where email ilike 'anh.duong@vieent.vn'
    loop
      insert into notifications (profile_id, title, body, link, created_at)
      values (target_id, 'Design — requests waiting', body, '/tickets/design', now());
    end loop;
  end if;

  if p_include_late then
    select count(*) into late_count from tickets
      where tab_id = design_tab_id and deleted_at is null
        and status not in ('COMPLETE', 'CANCEL')
        and deadline is not null and deadline::date < current_date;

    if late_count > 0 then
      body := replace(coalesce(templates->>'late', '{count} Design ticket(s) overdue.'), '{count}', late_count::text);
      for target_id in
        select id from profiles where segment = 'Design'
        union
        select id from profiles where email ilike 'anh.duong@vieent.vn'
      loop
        insert into notifications (profile_id, title, body, link, created_at)
        values (target_id, 'Design — overdue tickets', body, '/tickets/design', now());
      end loop;
    end if;

    select count(*) into pending_revise_count from tickets
      where tab_id = design_tab_id and deleted_at is null and status in ('PENDING', 'REVISE');

    if pending_revise_count > 0 then
      body := replace(coalesce(templates->>'pendingRevise', '{count} Design ticket(s) Pending/Revise.'), '{count}', pending_revise_count::text);
      for target_id in select id from profiles where segment = 'AR' loop
        insert into notifications (profile_id, title, body, link, created_at)
        values (target_id, 'Design — Pending/Revise', body, '/tickets/design', now());
      end loop;
    end if;
  end if;
end;
$$;


--
-- Name: fanout_notification(text, text, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fanout_notification(p_team text, p_type text, p_title text, p_body text, p_link text, p_ticket_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  if p_team is null then
    return;
  end if;
  insert into notifications (profile_id, type, title, body, link, ticket_id)
  select id, p_type, p_title, p_body, p_link, p_ticket_id
  from profiles
  where segment = p_team or role = 'dev';
end;
$$;


--
-- Name: flag_overdue_batch_items(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.flag_overdue_batch_items() RETURNS void
    LANGUAGE plpgsql
    AS $$
declare
  item record;
  pic_ids uuid[];
  target_id uuid;
begin
  for item in
    select i.*, t.data as batch_data
    from phai_sinh_batch_items i
    join tickets t on t.id = i.batch_ticket_id
    where i.deleted_at is null
      and i.deadline is not null
      and i.deadline < current_date
      and i.status not in ('COMPLETE', 'CANCELED')
      and not (i.status_log ? ('overdue_flagged_' || current_date::text))
  loop
    if item.pic_profile_id is not null then
      pic_ids := array[item.pic_profile_id];
    else
      select array_agg(id) into pic_ids from profiles where segment in ('Youtube', 'Publishing', 'Operation') or segment = 'OPS';
    end if;

    foreach target_id in array coalesce(pic_ids, array[]::uuid[])
    loop
      insert into notifications (profile_id, ticket_id, title, body, link, created_at)
      values (
        target_id,
        item.batch_ticket_id,
        'Phái Sinh (Batch) item overdue',
        item.ten_bai || ' — deadline ' || item.deadline::text || ' has passed and is still ' || item.status,
        '/tickets/batch-phai-sinh/' || item.batch_ticket_id,
        now()
      );
    end loop;

    update phai_sinh_batch_items
    set status_log = status_log || jsonb_build_object('overdue_flagged_' || current_date::text, now()::text)
    where id = item.id;
  end loop;
end;
$$;


--
-- Name: generate_base36_token(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_base36_token(byte_length integer DEFAULT 16, pad_length integer DEFAULT 25) RETURNS text
    LANGUAGE plpgsql
    AS $$
declare
  chars text := '0123456789abcdefghijklmnopqrstuvwxyz';
  raw bytea := gen_random_bytes(byte_length);
  num numeric := 0;
  result text := '';
  i int;
  remainder int;
begin
  for i in 0..length(raw)-1 loop
    num := num * 256 + get_byte(raw, i);
  end loop;

  if num = 0 then
    result := '0';
  else
    while num > 0 loop
      remainder := (num % 36)::int;
      result := substr(chars, remainder + 1, 1) || result;
      num := div(num, 36);
    end loop;
  end if;

  return lpad(result, pad_length, '0');
end;
$$;


--
-- Name: milestone_roster_nightly_reset(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.milestone_roster_nightly_reset() RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  update milestone_chart_roster
  set rank = null, updated_at = now()
  where rank is not null;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: releases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.releases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    did text,
    project_type text DEFAULT 'BRIEF & DATA'::text NOT NULL,
    label text NOT NULL,
    title text NOT NULL,
    main_artist text NOT NULL,
    feature_artist text,
    genre text,
    release_date date NOT NULL,
    release_time time without time zone DEFAULT '19:00:00'::time without time zone NOT NULL,
    theme text,
    drive_link text,
    brief text,
    requires_dsp_pitching boolean DEFAULT false NOT NULL,
    has_isrc boolean DEFAULT false NOT NULL,
    status text DEFAULT 'Chưa bắt đầu'::text NOT NULL,
    package_total_value numeric,
    package_vieent_support numeric,
    package_label_payment numeric,
    package_payment_status text DEFAULT 'Chưa Thực Hiện'::text NOT NULL,
    package_ticket_sent boolean DEFAULT false NOT NULL,
    package_locked boolean DEFAULT false NOT NULL,
    requester_segment text,
    requester_name text,
    release_category text DEFAULT 'New Release'::text NOT NULL,
    meta_audio text DEFAULT 'false'::text NOT NULL,
    meta_artwork text DEFAULT 'false'::text NOT NULL,
    meta_working_files text DEFAULT 'false'::text NOT NULL,
    meta_lyric text DEFAULT 'false'::text NOT NULL,
    meta_mv text DEFAULT 'false'::text NOT NULL,
    meta_doc text DEFAULT 'false'::text NOT NULL,
    requested boolean DEFAULT false NOT NULL,
    upload_status text DEFAULT 'Running'::text NOT NULL,
    priority_pitching_used boolean DEFAULT false NOT NULL,
    needs_update boolean DEFAULT false NOT NULL,
    smartlink text,
    upc text,
    link_lbm text,
    link_share text,
    link_preorder text,
    link_ugc text,
    link_media_report text,
    link_phu_luc text,
    promotion_package_url text,
    published_at timestamp with time zone,
    priority_pitching text,
    isrc text,
    apple_id text,
    pitching_status_spotify text,
    pitching_status_nct text,
    pitching_status_zing text,
    pitching_pills_nct text[],
    pitching_pills_zing text[],
    pitch_genre text,
    pitch_mood text,
    pitch_instrumental text,
    pitch_note text,
    pitch_memo text,
    canva_mv_status text,
    canva_status text,
    artist_pick_status text,
    musixmatch_link text,
    musixmatch_status text,
    nct_lyric text,
    zing_lyric text,
    phu_luc_ngay_gui date,
    phu_luc_ngay_ky date,
    linkshare_tiktok_timing text,
    linkshare_facebook_timing text,
    confirm_spotify_correct boolean DEFAULT false NOT NULL,
    confirm_apple_correct boolean DEFAULT false NOT NULL,
    confirm_zing_correct boolean DEFAULT false NOT NULL,
    confirm_nct_correct boolean DEFAULT false NOT NULL,
    confirm_fb_correct boolean DEFAULT false NOT NULL,
    confirm_ytb_correct boolean DEFAULT false NOT NULL,
    confirm_insta_sound boolean DEFAULT false NOT NULL,
    confirm_lyrics_canva_check boolean DEFAULT false NOT NULL,
    confirm_tiktok_sound_updated boolean DEFAULT false NOT NULL,
    confirm_smartlink_updated boolean DEFAULT false NOT NULL,
    confirm_tag boolean DEFAULT false NOT NULL,
    gate_pitching text DEFAULT 'false'::text NOT NULL,
    gate_publishing text DEFAULT 'false'::text NOT NULL,
    gate_goi_ho_tro_truyen_thong text DEFAULT 'false'::text NOT NULL,
    gate_split_share text DEFAULT 'false'::text NOT NULL,
    gate_lyric_musixmatch text DEFAULT 'false'::text NOT NULL,
    gate_design text DEFAULT 'false'::text NOT NULL,
    gate_co_trong_net_youtube text DEFAULT 'false'::text NOT NULL,
    gate_artist_profile text DEFAULT 'false'::text NOT NULL,
    gate_artist_photo text DEFAULT 'false'::text NOT NULL,
    gate_project_proposal text DEFAULT 'false'::text NOT NULL,
    gate_pre_order text DEFAULT 'false'::text NOT NULL,
    artist_photo_url text,
    project_proposal_url text,
    split_share_entries jsonb DEFAULT '[]'::jsonb NOT NULL,
    custom_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    legacy_id text,
    int_media_requested boolean DEFAULT false NOT NULL,
    single_album_ep text DEFAULT 'Single'::text NOT NULL,
    sony_publish boolean DEFAULT false NOT NULL,
    is_publish boolean DEFAULT false NOT NULL,
    has_splitshare boolean DEFAULT false NOT NULL,
    phu_luc_requested boolean DEFAULT false NOT NULL,
    start_date date,
    end_date date,
    creation_on_tiktok text,
    legacy_booking_dot1_raw text,
    legacy_booking_dot2_raw text,
    gate_data_request text DEFAULT 'false'::text NOT NULL,
    gate_mv_spotify text DEFAULT 'false'::text NOT NULL,
    gate_discovery_mode_spotify text DEFAULT 'false'::text NOT NULL,
    gate_sony_publish text DEFAULT 'false'::text NOT NULL,
    gate_legal_request text DEFAULT 'false'::text NOT NULL,
    gate_phu_luc_mg text DEFAULT 'false'::text NOT NULL,
    gate_phu_luc_truyen_thong text DEFAULT 'false'::text NOT NULL,
    gate_phu_luc_publishing text DEFAULT 'false'::text NOT NULL,
    design_content_types jsonb DEFAULT '[]'::jsonb NOT NULL,
    artist_portfolio_url text,
    pitching_note text,
    confirm_note text,
    pre_release_note text,
    booking_note text,
    spotify_mv_link text,
    link_goi_tt_legacy text,
    media_report_status text,
    recording_studio_included boolean DEFAULT false NOT NULL,
    note_ar text,
    note_marketing text,
    note_ops text,
    note_legal text,
    link_publishing text,
    publishing_ngay_gui date,
    publishing_ngay_ky date,
    pseudo_package_parent_did text,
    pitching_status_apple text,
    pitching_pic_priority uuid,
    pitching_pic_spotify uuid,
    pitching_pic_apple uuid,
    pitching_pic_domestic uuid,
    publishing_gia_tri text,
    copyright_checklist jsonb DEFAULT '{}'::jsonb NOT NULL,
    link_media_report_custom text,
    youtube_ads_url text,
    youtube_ads_booking_note text,
    ar_product_note text,
    main_artist_tags text[] DEFAULT '{}'::text[] NOT NULL,
    feature_artist_tags text[] DEFAULT '{}'::text[] NOT NULL,
    gate_artist_profile_verify text DEFAULT 'false'::text NOT NULL,
    pitching_status_spotify_banner text,
    pitching_pic_spotify_banner uuid,
    pitching_domestic_services jsonb DEFAULT '[]'::jsonb NOT NULL,
    pitching_domestic_services_nct jsonb DEFAULT '[]'::jsonb NOT NULL,
    pitching_domestic_services_zing jsonb DEFAULT '[]'::jsonb NOT NULL,
    pitching_spotify_banner_drive_link text,
    phu_luc_gia_tri text
);


--
-- Name: COLUMN releases.artist_portfolio_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.releases.artist_portfolio_url IS 'URL popup revealed when gate_artist_profile ("Artist Info") is set to Yes — "add artist portfolio link".';


--
-- Name: COLUMN releases.pitching_note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.releases.pitching_note IS 'Pitching Workstation''s own Note column — independent of pitch_note (that one is Spotify-pitch-specific, inside the ticket popup).';


--
-- Name: COLUMN releases.confirm_note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.releases.confirm_note IS 'Confirm Workstation''s own Note column — shared between Phase 1 and Phase 2 (same field, same release).';


--
-- Name: COLUMN releases.pre_release_note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.releases.pre_release_note IS 'Pre-release Workstation''s own Note column.';


--
-- Name: COLUMN releases.booking_note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.releases.booking_note IS 'Booking Board''s own Note column — fixed column next to Result, independent of the round-scoped media_booking_entries links.';


--
-- Name: COLUMN releases.spotify_mv_link; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.releases.spotify_mv_link IS 'Music Video on Spotify ticket''s own field (app/tickets/mv-spotify) — the actual MV URL once uploaded to Spotify.';


--
-- Name: COLUMN releases.link_goi_tt_legacy; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.releases.link_goi_tt_legacy IS 'Old-system "LINK GÓI TT" url, carried over from the legacy booking board data for backup/reference only — not read or written by any V2 workflow. Editable on the release detail page''s URL tab.';


--
-- Name: COLUMN releases.media_report_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.releases.media_report_status IS 'null | ''ready'' | ''sent'' — see app/booking/page.js (MediaReportCell) and app/pick-package/[token]/page.js. Round 54.';


--
-- Name: needs_phu_luc(public.releases); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.needs_phu_luc(r public.releases) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select r.project_type not in ('BRIEF & DATA', 'DEALING');
$$;


--
-- Name: notify_on_ticket_complete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_on_ticket_complete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  settings_enabled boolean;
  also_notify_team boolean;
  tab_label text;
  tab_team text;
  tab_key text;
  product_title text;
begin
  if new.status is distinct from old.status and new.status = 'COMPLETE' then
    select enabled, notify_team_on_complete into settings_enabled, also_notify_team from notification_settings where id = 1;
    if not coalesce(settings_enabled, false) then
      return new;
    end if;

    select label, executor_team, key into tab_label, tab_team, tab_key from ticket_tabs where id = new.tab_id;

    product_title := case tab_key
      when 'phai_sinh' then new.data ->> 'tenBai'
      when 'manual_claim' then new.data ->> 'tenBai'
      when 'report_conflict' then new.data ->> 'assetTitle'
      when 'artist_profile' then new.data ->> 'artistName'
      when 'khac' then new.data ->> 'request'
      when 'design' then new.data ->> 'project'
      else null
    end;

    if product_title is null and tab_key = 'phu_luc' and new.data ->> 'releaseId' is not null then
      begin
        select title into product_title from releases where id = (new.data ->> 'releaseId')::uuid;
      exception when others then
        product_title := null;
      end;
    elsif product_title is null then
      select title into product_title from releases where did = new.data ->> 'releaseId';
    end if;

    if new.requester_segment is not null then
      perform fanout_notification(
        new.requester_segment,
        'ticket_complete',
        tab_label || ' ticket completed' || case when product_title is not null then ' — ' || product_title else '' end,
        coalesce(new.requester_name, 'Your ticket') || ' is done.',
        '/tickets/' || replace(tab_key, '_', '-'),
        new.id
      );
    end if;

    if coalesce(also_notify_team, false) and tab_team is not null then
      perform fanout_notification(
        tab_team,
        'ticket_complete',
        tab_label || ' ticket completed' || case when product_title is not null then ' — ' || product_title else '' end,
        coalesce(new.requester_name, new.requester_segment, 'A ticket') || ' is done.',
        '/tickets/' || replace(tab_key, '_', '-'),
        new.id
      );
    end if;
  end if;
  return new;
end;
$$;


--
-- Name: notify_on_ticket_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_on_ticket_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  settings_enabled boolean;
  tab_label text;
  tab_team text;
  tab_key text;
  product_title text;
begin
  select enabled into settings_enabled from notification_settings where id = 1;
  if not coalesce(settings_enabled, false) then
    return new;
  end if;

  select label, executor_team, key into tab_label, tab_team, tab_key from ticket_tabs where id = new.tab_id;
  if tab_team is null then
    return new;
  end if;

  product_title := case tab_key
    when 'phai_sinh' then new.data ->> 'tenBai'
    when 'manual_claim' then new.data ->> 'tenBai'
    when 'report_conflict' then new.data ->> 'assetTitle'
    when 'artist_profile' then new.data ->> 'artistName'
    when 'khac' then new.data ->> 'request'
    when 'design' then new.data ->> 'project'
    else null
  end;

  if product_title is null and tab_key = 'phu_luc' and new.data ->> 'releaseId' is not null then
    begin
      select title into product_title from releases where id = (new.data ->> 'releaseId')::uuid;
    exception when others then
      product_title := null;
    end;
  elsif product_title is null then
    select title into product_title from releases where did = new.data ->> 'releaseId';
  end if;

  perform fanout_notification(
    tab_team,
    'new_ticket',
    'New ' || tab_label || ' ticket' || case when product_title is not null then ' — ' || product_title else '' end,
    coalesce(new.requester_name, new.requester_segment, 'A new ticket') || ' needs a PIC.',
    '/tickets/' || replace(tab_key, '_', '-'),
    new.id
  );
  return new;
end;
$$;


--
-- Name: phu_luc_status(public.releases); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.phu_luc_status(r public.releases) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
begin
  if r.link_phu_luc is not null and r.phu_luc_ngay_ky is not null then return 'Đã Ký'; end if;
  if r.link_phu_luc is not null and r.phu_luc_ngay_gui is not null then return 'Chờ Ký'; end if;
  if r.link_phu_luc is not null then return 'Đã Soạn'; end if;
  return 'Chưa Soạn';
end;
$$;


--
-- Name: prevent_duplicate_media_booking(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_duplicate_media_booking() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  tab_key text;
  rel_id text;
  dupe_count int;
begin
  select key into tab_key from ticket_tabs where id = new.tab_id;
  if tab_key is distinct from 'media_booking' then
    return new;
  end if;
  if new.deleted_at is not null then
    return new;
  end if;
  rel_id := new.data->>'releaseId';
  if rel_id is null then
    return new;
  end if;

  select count(*) into dupe_count
  from tickets t
  join ticket_tabs tt on tt.id = t.tab_id
  where tt.key = 'media_booking'
    and t.deleted_at is null
    and t.data->>'releaseId' = rel_id
    and t.id is distinct from new.id;

  if dupe_count > 0 then
    raise exception 'A Media Booking ticket already exists for release % — only one is allowed per release.', rel_id;
  end if;
  return new;
end;
$$;


--
-- Name: publishing_status(public.releases); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publishing_status(r public.releases) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
begin
  if r.link_publishing is not null and r.publishing_ngay_ky is not null then return 'Đã Ký'; end if;
  if r.link_publishing is not null and r.publishing_ngay_gui is not null then return 'Chờ Ký'; end if;
  if r.link_publishing is not null then return 'Đã Soạn'; end if;
  return 'Chưa Soạn';
end;
$$;


--
-- Name: set_published_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_published_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.published_at is null and (new.smartlink is not null or new.upc is not null) then
    new.published_at := now();
  end if;
  return new;
end;
$$;


--
-- Name: set_release_did(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_release_did() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  date_part text;
  seq_part  text;
  n         bigint;
begin
  if new.did is not null then
    return new;  -- allow manual override; only auto-fill when blank
  end if;

  date_part := to_char(new.release_date, 'DDMMYYYY');
  n := nextval('release_did_seq');
  seq_part := lpad((n % 10000)::text, 4, '0');

  new.did := _field_initials(new.title) || _field_initials(new.main_artist)
             || '-' || date_part || '-' || seq_part;
  return new;
end;
$$;


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: artists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.artists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stage_name text NOT NULL,
    real_name text,
    email text,
    phan_loai text,
    spotify_url text,
    tiktok_url text,
    facebook_url text,
    fanpage_url text,
    youtube_url text,
    zing_url text,
    instagram_url text,
    apple_url text,
    nct_url text,
    note text,
    label_id uuid,
    company_name text,
    type text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id bigint NOT NULL,
    actor text NOT NULL,
    action text NOT NULL,
    entity text NOT NULL,
    entity_id text,
    field text,
    before_val jsonb,
    after_val jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: booking_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    platform text NOT NULL,
    channel_type text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    brand text,
    url text,
    follower_count integer,
    note text,
    stats_synced_at timestamp with time zone
);


--
-- Name: COLUMN booking_channels.brand; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.booking_channels.brand IS 'Raw brand/hạng mục grouping from the source reference sheet (VIEENT / ENVI - MIỀN TÂY/BOLERO / INDIE / VPOP / capcut) — not the Booking Board''s derived column brand names (PAGE VPOP, TIKTOK VPOP, ...). Null for hand-added channels.';


--
-- Name: COLUMN booking_channels.url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.booking_channels.url IS 'The channel/page URL — lets the Booking popup prefill a link instead of the URL being typed from scratch.';


--
-- Name: COLUMN booking_channels.follower_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.booking_channels.follower_count IS 'Follower count as of the last reference-sheet update. Null = not tracked, distinct from 0.';


--
-- Name: COLUMN booking_channels.note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.booking_channels.note IS 'Loose descriptive tag from the source sheet, e.g. "Key news/tổng hợp", "Key lyrics" — display-only.';


--
-- Name: COLUMN booking_channels.stats_synced_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.booking_channels.stats_synced_at IS 'Set only by app/api/refresh-youtube-stats — null means follower_count (if any) was hand-typed, never auto-refreshed. Round 56.';


--
-- Name: contract_type_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contract_type_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contract_type text NOT NULL,
    total_value numeric,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    terms_text text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tro_gia_booking_text text
);


--
-- Name: design_platforms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.design_platforms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: design_sizes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.design_sizes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    design_type_id uuid NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: design_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.design_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    platform_id uuid NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: dsp_metrics_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dsp_metrics_snapshots (
    id bigint NOT NULL,
    dsp_link_id uuid NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    streams bigint,
    extra jsonb,
    fetch_error text
);


--
-- Name: dsp_metrics_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.dsp_metrics_snapshots ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.dsp_metrics_snapshots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: entity_field_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_field_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_other boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: entity_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    field_key text NOT NULL,
    label text NOT NULL,
    field_type text DEFAULT 'text'::text NOT NULL,
    options jsonb,
    group_id uuid,
    is_builtin boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: global_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.global_settings (
    key text NOT NULL,
    value text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.labels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label_name text NOT NULL,
    hop_tac_legacy text,
    pl_nhom text,
    pic text,
    hinh_thuc_hoat_dong text,
    latest_activity_year integer,
    hinh_thuc_phat_hanh text,
    parent_label_id uuid,
    phan_loai text,
    the_loai text,
    note text,
    curve_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    contract_signed boolean DEFAULT false NOT NULL,
    hop_tac text[] DEFAULT '{}'::text[] NOT NULL,
    hop_tac_status jsonb DEFAULT '{}'::jsonb NOT NULL,
    label_master_file text
);


--
-- Name: COLUMN labels.hop_tac_legacy; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.labels.hop_tac_legacy IS 'Old free-text "Hợp tác" value, preserved as-is, no longer surfaced in the UI. Superseded by hop_tac (array, pill tag picker).';


--
-- Name: COLUMN labels.curve_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.labels.curve_id IS 'Legacy — no longer surfaced in the UI or used to gate prefix removal. See contract_signed instead.';


--
-- Name: COLUMN labels.contract_signed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.labels.contract_signed IS 'Set once by the "Contract Signed" button on the Label List (app/labels/page.js). That same click also strips the "HĐ - " prefix from label_name — this column is not editable anywhere else.';


--
-- Name: COLUMN labels.hop_tac; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.labels.hop_tac IS '"Hợp tác" — multi-select pill tags: Youtube / Publishing / Nhạc Số. See lib/pickerOptions.js LABEL_HOP_TAC_OPTIONS.';


--
-- Name: COLUMN labels.label_master_file; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.labels.label_master_file IS 'Round 111 — inline-edit URL field on the Label List; renders as a clickable new-tab link once it is a valid http(s) URL (see lib/LinkOrEditCell.js).';


--
-- Name: lookup_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lookup_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text NOT NULL,
    value text NOT NULL,
    label text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: magic_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.magic_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token text DEFAULT public.generate_base36_token() NOT NULL,
    release_id uuid NOT NULL,
    email text,
    locked boolean DEFAULT false NOT NULL,
    sent_at timestamp with time zone,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text
);


--
-- Name: media_booking_channel_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_booking_channel_status (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    release_id uuid NOT NULL,
    category_id uuid NOT NULL,
    brand text NOT NULL,
    column_key text NOT NULL,
    status text DEFAULT 'Chưa Chạy'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE media_booking_channel_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.media_booking_channel_status IS 'Round 125 — per-cell run status for Booking Board columns that can have multiple link rows (currently TikTok Channel Partner-group columns), separate from any one link''s own status.';


--
-- Name: media_booking_content_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_booking_content_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    release_id uuid NOT NULL,
    category_id uuid NOT NULL,
    channel_id uuid,
    platform text,
    brand text DEFAULT ''::text NOT NULL,
    channel_count integer DEFAULT 1 NOT NULL,
    count_tung_hint integer DEFAULT 0 NOT NULL,
    count_out_now integer DEFAULT 0 NOT NULL,
    count_listen_now integer DEFAULT 0 NOT NULL,
    count_addin_post integer DEFAULT 0 NOT NULL,
    count_posts integer DEFAULT 0 NOT NULL,
    channel_count_dot2 integer DEFAULT 0 NOT NULL,
    count_posts_dot2 integer DEFAULT 0 NOT NULL,
    unit_price numeric,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: media_booking_dot2_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_booking_dot2_targets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    release_id uuid NOT NULL,
    category_id uuid NOT NULL,
    creation_target numeric,
    links_paid_target numeric,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: media_booking_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_booking_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    release_id uuid NOT NULL,
    booking_round text NOT NULL,
    platform text NOT NULL,
    channel_type text DEFAULT 'Direct'::text NOT NULL,
    status text DEFAULT 'Chưa Booking'::text NOT NULL,
    category_id uuid,
    channel_name text,
    link text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    subchannel_type text,
    quantity numeric
);


--
-- Name: COLUMN media_booking_entries.subchannel_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.media_booking_entries.subchannel_type IS 'TikTok Channel only: one of TIKTOK NEWS / TIKTOK CAPCUT / MẪU CAPCUT / TIKTOK REUP MV / TIKTOK LYRICS — the Booking Board''s 3rd-layer column once a brand is picked. Independent of `platform`, which still holds the specific channel/account name for TikTok Channel entries. Null for every other Hạng Mục and for entries created before this migration.';


--
-- Name: COLUMN media_booking_entries.quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.media_booking_entries.quantity IS 'Ads only (round 51+) — a single quantity + status per (release, booking_round, Ads category, ad brand, metric), instead of a link. See app/booking/page.js.';


--
-- Name: media_booking_package_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_booking_package_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    release_id uuid NOT NULL,
    category_id uuid NOT NULL,
    brand text DEFAULT ''::text NOT NULL,
    total_posts integer DEFAULT 0 NOT NULL,
    unit_price numeric,
    total_money numeric,
    detail_text text,
    tier_type text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    skipped boolean DEFAULT false NOT NULL,
    metric_quantities jsonb,
    platform_quantities jsonb
);


--
-- Name: COLUMN media_booking_package_categories.metric_quantities; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.media_booking_package_categories.metric_quantities IS 'Round 114 — Ads only: real per-metric quantities from Summarize, e.g. { "HPTO": 10, "In-Stream Audio": 5 }.';


--
-- Name: COLUMN media_booking_package_categories.platform_quantities; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.media_booking_package_categories.platform_quantities IS 'Round 120 — this rollup row''s own per-platform/per-subchannel breakdown for its one real brand, e.g. { "Facebook": 30, "TikTok": 12 }. Merged (by groupSummarizedRows in app/tickets/media-booking/page.js) into media_booking_package_lines.brand_column_quantities on every Summarize.';


--
-- Name: media_booking_package_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_booking_package_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    package_id uuid NOT NULL,
    category_id uuid,
    brand text DEFAULT ''::text NOT NULL,
    platform text,
    unit text,
    quantity numeric,
    detail text,
    unit_price numeric,
    is_package_priced boolean DEFAULT false NOT NULL,
    package_count numeric,
    amount numeric,
    sort_order integer DEFAULT 0 NOT NULL,
    metric_quantities jsonb,
    brand_column_quantities jsonb
);


--
-- Name: COLUMN media_booking_package_lines.metric_quantities; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.media_booking_package_lines.metric_quantities IS 'Round 114 — Ads multi-metric brands only (Facebook/TikTok/Spotify Ads): real per-metric quantities, e.g. { "HPTO": 10, "In-Stream Audio": 5 }. Read by the Booking Board''s per-subchannel-metric columns.';


--
-- Name: COLUMN media_booking_package_lines.brand_column_quantities; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.media_booking_package_lines.brand_column_quantities IS 'Round 120 — Social/Community/TikTok Channel only, on their one mushed brand:"" line: real per-brand, per-platform/per-subchannel targets, keyed "brand::column" (e.g. "SOCIAL VIENT::Facebook"). Snapshotted at Summarize time, not live — read by app/booking/page.js''s bookedFor()/packageLineColumnTarget for the Booking Board''s brand-drilled columns.';


--
-- Name: media_booking_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_booking_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    release_id uuid NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: milestone_chart_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.milestone_chart_entries (
    id bigint NOT NULL,
    chart text NOT NULL,
    entry_date date NOT NULL,
    track_title text NOT NULL,
    artist text DEFAULT ''::text NOT NULL,
    rank integer NOT NULL,
    platform text,
    did text,
    drive_link text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: milestone_chart_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.milestone_chart_entries ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.milestone_chart_entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: milestone_chart_roster; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.milestone_chart_roster (
    id bigint NOT NULL,
    platform text NOT NULL,
    chart text NOT NULL,
    track_title text NOT NULL,
    artist text DEFAULT ''::text NOT NULL,
    rank integer,
    did text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: milestone_chart_roster_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.milestone_chart_roster ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.milestone_chart_roster_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: milestone_rank_history; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.milestone_rank_history AS
 WITH ranked AS (
         SELECT milestone_chart_entries.id,
            milestone_chart_entries.chart,
            milestone_chart_entries.entry_date,
            milestone_chart_entries.track_title,
            milestone_chart_entries.artist,
            milestone_chart_entries.rank,
            milestone_chart_entries.platform,
            milestone_chart_entries.did,
            milestone_chart_entries.drive_link,
            milestone_chart_entries.created_at,
            row_number() OVER (PARTITION BY milestone_chart_entries.chart, milestone_chart_entries.track_title, milestone_chart_entries.artist ORDER BY milestone_chart_entries.entry_date) AS rn
           FROM public.milestone_chart_entries
        ), grouped AS (
         SELECT ranked.id,
            ranked.chart,
            ranked.entry_date,
            ranked.track_title,
            ranked.artist,
            ranked.rank,
            ranked.platform,
            ranked.did,
            ranked.drive_link,
            ranked.created_at,
            ranked.rn,
            (ranked.entry_date - ((ranked.rn)::double precision * '1 day'::interval)) AS streak_group
           FROM ranked
        )
 SELECT id,
    chart,
    entry_date,
    track_title,
    artist,
    rank,
    platform,
    did,
    drive_link,
    lag(rank) OVER (PARTITION BY chart, track_title, artist ORDER BY entry_date) AS prev_rank,
    (rank - lag(rank) OVER (PARTITION BY chart, track_title, artist ORDER BY entry_date)) AS rank_change,
    count(*) OVER (PARTITION BY chart, track_title, artist, streak_group) AS streak_days
   FROM grouped
  ORDER BY chart, track_title, artist, entry_date;


--
-- Name: notification_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_settings (
    id integer DEFAULT 1 NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    notify_team_on_complete boolean DEFAULT false NOT NULL,
    digest_hour integer DEFAULT 8 NOT NULL,
    digest_recipients text[] DEFAULT '{}'::text[] NOT NULL,
    digest_last_sent_date date,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_settings_digest_hour_check CHECK (((digest_hour >= 0) AND (digest_hour <= 23))),
    CONSTRAINT notification_settings_id_check CHECK ((id = 1))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    link text,
    ticket_id uuid,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: package_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.package_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: phai_sinh_batch_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.phai_sinh_batch_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_ticket_id uuid NOT NULL,
    ten_bai text NOT NULL,
    version text,
    the_loai text,
    artist text,
    composer text,
    producer text,
    mixer text,
    release_date date,
    upc text,
    isrc text,
    link_audio text,
    link_artwork text,
    lyrics text,
    smartlink text,
    ngay_nhan date,
    ngay_hoan_thanh date,
    tac_quyen text,
    type_request text DEFAULT 'Phái Sinh'::text,
    link_labelmaster text,
    note text,
    pic_profile_id uuid,
    deadline date,
    status text DEFAULT 'REQUESTED'::text NOT NULL,
    status_log jsonb DEFAULT '{}'::jsonb NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    takedown_ban_cu boolean DEFAULT false NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_id uuid,
    email text NOT NULL,
    name text,
    role text NOT NULL,
    segment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: release_did_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.release_did_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: release_dsp_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.release_dsp_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    release_id uuid NOT NULL,
    platform text NOT NULL,
    url_or_id text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: release_package_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.release_package_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    release_id uuid NOT NULL,
    category text NOT NULL,
    unit text,
    quantity numeric,
    detail text,
    amount numeric,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: release_stream_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.release_stream_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    release_id uuid,
    manual_title text,
    manual_artist text,
    manual_release_date date,
    manual_upc text,
    is_album boolean DEFAULT false NOT NULL,
    current_spotify text,
    playlist_spotify text,
    views_tiktok text,
    creations_tiktok text,
    current_zing text,
    homepage_banner_zing text,
    bxh_nhac_moi text,
    album_hot_zing text,
    cover_playlist_zing text,
    playlist_zing text,
    current_nct text,
    banner_homepage_nct text,
    cover_playlist_nct text,
    playlist_nct text,
    current_ytb text,
    youtube_trending text,
    current_ytb_music text,
    views_fb text,
    creations_fb text,
    stream_note text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    manual_did text
);


--
-- Name: release_tracks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.release_tracks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    release_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    track_name text DEFAULT ''::text NOT NULL,
    main_artist text,
    feature_artist text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    copyright_checklist jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: team_building_survey_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_building_survey_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ticket_tabs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_tabs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    segment text,
    status_options text[] DEFAULT ARRAY['REQUESTED'::text, 'PROCESS'::text, 'COMPLETE'::text, 'REFUND'::text, 'CANCELED'::text] NOT NULL,
    default_status text DEFAULT 'REQUESTED'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    executor_team text
);


--
-- Name: tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tab_id uuid NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    requester_segment text,
    requester_name text,
    executor text,
    pic_profile_id uuid,
    deadline timestamp with time zone,
    status text DEFAULT 'REQUESTED'::text NOT NULL,
    status_log jsonb DEFAULT '{}'::jsonb NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    legacy_id text
);


--
-- Name: workstation_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workstation_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workstation text NOT NULL,
    column_key text NOT NULL,
    release_id uuid,
    pic_profile_id uuid NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: artists artists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artists
    ADD CONSTRAINT artists_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: booking_channels booking_channels_name_platform_channel_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_channels
    ADD CONSTRAINT booking_channels_name_platform_channel_type_key UNIQUE (name, platform, channel_type);


--
-- Name: booking_channels booking_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_channels
    ADD CONSTRAINT booking_channels_pkey PRIMARY KEY (id);


--
-- Name: contract_type_packages contract_type_packages_contract_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_type_packages
    ADD CONSTRAINT contract_type_packages_contract_type_key UNIQUE (contract_type);


--
-- Name: contract_type_packages contract_type_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_type_packages
    ADD CONSTRAINT contract_type_packages_pkey PRIMARY KEY (id);


--
-- Name: design_platforms design_platforms_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_platforms
    ADD CONSTRAINT design_platforms_name_key UNIQUE (name);


--
-- Name: design_platforms design_platforms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_platforms
    ADD CONSTRAINT design_platforms_pkey PRIMARY KEY (id);


--
-- Name: design_sizes design_sizes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_sizes
    ADD CONSTRAINT design_sizes_pkey PRIMARY KEY (id);


--
-- Name: design_types design_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_types
    ADD CONSTRAINT design_types_pkey PRIMARY KEY (id);


--
-- Name: design_types design_types_platform_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_types
    ADD CONSTRAINT design_types_platform_id_name_key UNIQUE (platform_id, name);


--
-- Name: dsp_metrics_snapshots dsp_metrics_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dsp_metrics_snapshots
    ADD CONSTRAINT dsp_metrics_snapshots_pkey PRIMARY KEY (id);


--
-- Name: entity_field_groups entity_field_groups_entity_type_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_field_groups
    ADD CONSTRAINT entity_field_groups_entity_type_key_key UNIQUE (entity_type, key);


--
-- Name: entity_field_groups entity_field_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_field_groups
    ADD CONSTRAINT entity_field_groups_pkey PRIMARY KEY (id);


--
-- Name: entity_fields entity_fields_entity_type_field_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_fields
    ADD CONSTRAINT entity_fields_entity_type_field_key_key UNIQUE (entity_type, field_key);


--
-- Name: entity_fields entity_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_fields
    ADD CONSTRAINT entity_fields_pkey PRIMARY KEY (id);


--
-- Name: global_settings global_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_settings
    ADD CONSTRAINT global_settings_pkey PRIMARY KEY (key);


--
-- Name: labels labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labels
    ADD CONSTRAINT labels_pkey PRIMARY KEY (id);


--
-- Name: lookup_options lookup_options_category_value_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lookup_options
    ADD CONSTRAINT lookup_options_category_value_key UNIQUE (category, value);


--
-- Name: lookup_options lookup_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lookup_options
    ADD CONSTRAINT lookup_options_pkey PRIMARY KEY (id);


--
-- Name: magic_links magic_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magic_links
    ADD CONSTRAINT magic_links_pkey PRIMARY KEY (id);


--
-- Name: magic_links magic_links_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magic_links
    ADD CONSTRAINT magic_links_token_key UNIQUE (token);


--
-- Name: media_booking_channel_status media_booking_channel_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_booking_channel_status
    ADD CONSTRAINT media_booking_channel_status_pkey PRIMARY KEY (id);


--
-- Name: media_booking_channel_status media_booking_channel_status_release_id_category_id_brand_c_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_booking_channel_status
    ADD CONSTRAINT media_booking_channel_status_release_id_category_id_brand_c_key UNIQUE (release_id, category_id, brand, column_key);


--
-- Name: media_booking_content_entries media_booking_content_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_booking_content_entries
    ADD CONSTRAINT media_booking_content_entries_pkey PRIMARY KEY (id);


--
-- Name: media_booking_dot2_targets media_booking_dot2_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_booking_dot2_targets
    ADD CONSTRAINT media_booking_dot2_targets_pkey PRIMARY KEY (id);


--
-- Name: media_booking_dot2_targets media_booking_dot2_targets_release_id_category_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_booking_dot2_targets
    ADD CONSTRAINT media_booking_dot2_targets_release_id_category_id_key UNIQUE (release_id, category_id);


--
-- Name: media_booking_entries media_booking_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_booking_entries
    ADD CONSTRAINT media_booking_entries_pkey PRIMARY KEY (id);


--
-- Name: media_booking_package_categories media_booking_package_categori_release_id_category_id_brand_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_booking_package_categories
    ADD CONSTRAINT media_booking_package_categori_release_id_category_id_brand_key UNIQUE (release_id, category_id, brand);


--
-- Name: media_booking_package_categories media_booking_package_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_booking_package_categories
    ADD CONSTRAINT media_booking_package_categories_pkey PRIMARY KEY (id);


--
-- Name: media_booking_package_lines media_booking_package_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_booking_package_lines
    ADD CONSTRAINT media_booking_package_lines_pkey PRIMARY KEY (id);


--
-- Name: media_booking_packages media_booking_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_booking_packages
    ADD CONSTRAINT media_booking_packages_pkey PRIMARY KEY (id);


--
-- Name: milestone_chart_entries milestone_chart_entries_chart_track_title_artist_entry_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.milestone_chart_entries
    ADD CONSTRAINT milestone_chart_entries_chart_track_title_artist_entry_date_key UNIQUE (chart, track_title, artist, entry_date);


--
-- Name: milestone_chart_entries milestone_chart_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.milestone_chart_entries
    ADD CONSTRAINT milestone_chart_entries_pkey PRIMARY KEY (id);


--
-- Name: milestone_chart_roster milestone_chart_roster_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.milestone_chart_roster
    ADD CONSTRAINT milestone_chart_roster_pkey PRIMARY KEY (id);


--
-- Name: milestone_chart_roster milestone_chart_roster_platform_chart_track_title_artist_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.milestone_chart_roster
    ADD CONSTRAINT milestone_chart_roster_platform_chart_track_title_artist_key UNIQUE (platform, chart, track_title, artist);


--
-- Name: notification_settings notification_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: package_categories package_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_categories
    ADD CONSTRAINT package_categories_name_key UNIQUE (name);


--
-- Name: package_categories package_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_categories
    ADD CONSTRAINT package_categories_pkey PRIMARY KEY (id);


--
-- Name: phai_sinh_batch_items phai_sinh_batch_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phai_sinh_batch_items
    ADD CONSTRAINT phai_sinh_batch_items_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_auth_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_auth_id_key UNIQUE (auth_id);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: release_dsp_links release_dsp_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_dsp_links
    ADD CONSTRAINT release_dsp_links_pkey PRIMARY KEY (id);


--
-- Name: release_dsp_links release_dsp_links_release_id_platform_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_dsp_links
    ADD CONSTRAINT release_dsp_links_release_id_platform_key UNIQUE (release_id, platform);


--
-- Name: release_package_items release_package_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_package_items
    ADD CONSTRAINT release_package_items_pkey PRIMARY KEY (id);


--
-- Name: release_stream_metrics release_stream_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_stream_metrics
    ADD CONSTRAINT release_stream_metrics_pkey PRIMARY KEY (id);


--
-- Name: release_stream_metrics release_stream_metrics_release_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_stream_metrics
    ADD CONSTRAINT release_stream_metrics_release_id_key UNIQUE (release_id);


--
-- Name: release_tracks release_tracks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_tracks
    ADD CONSTRAINT release_tracks_pkey PRIMARY KEY (id);


--
-- Name: releases releases_did_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.releases
    ADD CONSTRAINT releases_did_key UNIQUE (did);


--
-- Name: releases releases_legacy_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.releases
    ADD CONSTRAINT releases_legacy_id_key UNIQUE (legacy_id);


--
-- Name: releases releases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.releases
    ADD CONSTRAINT releases_pkey PRIMARY KEY (id);


--
-- Name: team_building_survey_responses team_building_survey_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_building_survey_responses
    ADD CONSTRAINT team_building_survey_responses_pkey PRIMARY KEY (id);


--
-- Name: team_building_survey_responses team_building_survey_responses_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_building_survey_responses
    ADD CONSTRAINT team_building_survey_responses_profile_id_key UNIQUE (profile_id);


--
-- Name: ticket_tabs ticket_tabs_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_tabs
    ADD CONSTRAINT ticket_tabs_key_key UNIQUE (key);


--
-- Name: ticket_tabs ticket_tabs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_tabs
    ADD CONSTRAINT ticket_tabs_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_legacy_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_legacy_id_key UNIQUE (legacy_id);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


--
-- Name: workstation_assignments workstation_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workstation_assignments
    ADD CONSTRAINT workstation_assignments_pkey PRIMARY KEY (id);


--
-- Name: idx_artists_label_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_artists_label_id ON public.artists USING btree (label_id);


--
-- Name: idx_artists_stage_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_artists_stage_name ON public.artists USING btree (stage_name);


--
-- Name: idx_audit_log_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_lookup ON public.audit_log USING btree (created_at, actor, entity);


--
-- Name: idx_dsp_metrics_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dsp_metrics_lookup ON public.dsp_metrics_snapshots USING btree (dsp_link_id, fetched_at DESC);


--
-- Name: idx_lookup_options_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lookup_options_category ON public.lookup_options USING btree (category, sort_order) WHERE active;


--
-- Name: idx_magic_links_release; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_magic_links_release ON public.magic_links USING btree (release_id);


--
-- Name: idx_mb_content_entries_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mb_content_entries_lookup ON public.media_booking_content_entries USING btree (release_id, category_id);


--
-- Name: idx_mb_package_lines_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mb_package_lines_lookup ON public.media_booking_package_lines USING btree (package_id);


--
-- Name: idx_media_booking_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_booking_category ON public.media_booking_entries USING btree (release_id, category_id);


--
-- Name: idx_media_booking_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_booking_lookup ON public.media_booking_entries USING btree (release_id, booking_round, channel_type, platform);


--
-- Name: idx_milestone_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_milestone_lookup ON public.milestone_chart_entries USING btree (chart, track_title, artist, entry_date);


--
-- Name: idx_milestone_roster_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_milestone_roster_lookup ON public.milestone_chart_roster USING btree (platform, chart, sort_order);


--
-- Name: idx_notifications_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_recipient ON public.notifications USING btree (profile_id, created_at DESC);


--
-- Name: idx_phai_sinh_batch_items_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_phai_sinh_batch_items_batch ON public.phai_sinh_batch_items USING btree (batch_ticket_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_release_package_items_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_release_package_items_lookup ON public.release_package_items USING btree (release_id);


--
-- Name: idx_release_tracks_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_release_tracks_lookup ON public.release_tracks USING btree (release_id, sort_order);


--
-- Name: idx_releases_feature_artist_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_releases_feature_artist_tags ON public.releases USING gin (feature_artist_tags);


--
-- Name: idx_releases_main_artist_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_releases_main_artist_tags ON public.releases USING gin (main_artist_tags);


--
-- Name: idx_tickets_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_lookup ON public.tickets USING btree (tab_id, status) WHERE (deleted_at IS NULL);


--
-- Name: idx_workstation_assignments_pic; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workstation_assignments_pic ON public.workstation_assignments USING btree (pic_profile_id);


--
-- Name: uq_one_other_group_per_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_one_other_group_per_entity ON public.entity_field_groups USING btree (entity_type) WHERE is_other;


--
-- Name: uq_workstation_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_workstation_default ON public.workstation_assignments USING btree (workstation, column_key) WHERE (release_id IS NULL);


--
-- Name: uq_workstation_override; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_workstation_override ON public.workstation_assignments USING btree (workstation, column_key, release_id) WHERE (release_id IS NOT NULL);


--
-- Name: entity_fields trg_default_field_group; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_default_field_group BEFORE INSERT ON public.entity_fields FOR EACH ROW EXECUTE FUNCTION public.default_field_group();


--
-- Name: tickets trg_notify_on_ticket_complete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_on_ticket_complete AFTER UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.notify_on_ticket_complete();


--
-- Name: tickets trg_notify_on_ticket_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_on_ticket_insert AFTER INSERT ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.notify_on_ticket_insert();


--
-- Name: tickets trg_prevent_duplicate_media_booking; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_duplicate_media_booking BEFORE INSERT OR UPDATE OF data, tab_id, deleted_at ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_media_booking();


--
-- Name: releases trg_set_published_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_published_at BEFORE INSERT OR UPDATE ON public.releases FOR EACH ROW EXECUTE FUNCTION public.set_published_at();


--
-- Name: releases trg_set_release_did; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_release_did BEFORE INSERT ON public.releases FOR EACH ROW EXECUTE FUNCTION public.set_release_did();


--
-- Name: artists artists_label_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artists
    ADD CONSTRAINT artists_label_id_fkey FOREIGN KEY (label_id) REFERENCES public.labels(id);


--
-- Name: design_sizes design_sizes_design_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_sizes
    ADD CONSTRAINT design_sizes_design_type_id_fkey FOREIGN KEY (design_type_id) REFERENCES public.design_types(id) ON DELETE CASCADE;


--
-- Name: design_types design_types_platform_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_types
    ADD CONSTRAINT design_types_platform_id_fkey FOREIGN KEY (platform_id) REFERENCES public.design_platforms(id) ON DELETE CASCADE;


--
-- Name: dsp_metrics_snapshots dsp_metrics_snapshots_dsp_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dsp_metrics_snapshots
    ADD CONSTRAINT dsp_metrics_snapshots_dsp_link_id_fkey FOREIGN KEY (dsp_link_id) REFERENCES public.release_dsp_links(id) ON DELETE CASCADE;


--
-- Name: entity_fields entity_fields_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_fields
    ADD CONSTRAINT entity_fields_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.entity_field_groups(id);


--
-- Name: labels labels_parent_label_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labels
    ADD CONSTRAINT labels_parent_label_id_fkey FOREIGN KEY (parent_label_id) REFERENCES public.labels(id);


--
-- Name: magic_links magic_links_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magic_links
    ADD CONSTRAINT magic_links_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.releases(id) ON DELETE CASCADE;


--
-- Name: media_booking_channel_status media_booking_channel_status_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_booking_channel_status
    ADD CONSTRAINT media_booking_channel_status_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.package_categories(id);


--
-- Name: media_booking_channel_status media_booking_channel_status_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_booking_channel_status
    ADD CONSTRAINT media_booking_channel_status_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.releases(id) ON DELETE CASCADE;


--
-- Name: media_booking_content_entries media_booking_content_entries_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_booking_content_entries
    ADD CONSTRAINT media_booking_content_entries_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.package_categories(id);


--
-- Name: media_booking_content_entries media_booking_content_entries_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_booking_content_entries
    ADD CONSTRAINT media_booking_content_entries_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.booking_channels(id);


--
-- Name: media_booking_content_entries media_booking_content_entries_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_booking_content_entries
    ADD CONSTRAINT media_booking_content_entries_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.releases(id) ON DELETE CASCADE;


--
-- Name: media_booking_dot2_targets media_booking_dot2_targets_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_booking_dot2_targets
    ADD CONSTRAINT media_booking_dot2_targets_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.package_categories(id);


--
-- Name: media_booking_dot2_targets media_booking_dot2_targets_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_booking_dot2_targets
    ADD CONSTRAINT media_booking_dot2_targets_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.releases(id) ON DELETE CASCADE;


--
-- Name: media_booking_entries media_booking_entries_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_booking_entries
    ADD CONSTRAINT media_booking_entries_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.package_categories(id);


--
-- Name: media_booking_entries media_booking_entries_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_booking_entries
    ADD CONSTRAINT media_booking_entries_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.releases(id) ON DELETE CASCADE;


--
-- Name: media_booking_package_categories media_booking_package_categories_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_booking_package_categories
    ADD CONSTRAINT media_booking_package_categories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.package_categories(id);


--
-- Name: media_booking_package_categories media_booking_package_categories_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_booking_package_categories
    ADD CONSTRAINT media_booking_package_categories_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.releases(id) ON DELETE CASCADE;


--
-- Name: media_booking_package_lines media_booking_package_lines_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_booking_package_lines
    ADD CONSTRAINT media_booking_package_lines_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.package_categories(id);


--
-- Name: media_booking_package_lines media_booking_package_lines_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_booking_package_lines
    ADD CONSTRAINT media_booking_package_lines_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.media_booking_packages(id) ON DELETE CASCADE;


--
-- Name: media_booking_packages media_booking_packages_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_booking_packages
    ADD CONSTRAINT media_booking_packages_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.releases(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: phai_sinh_batch_items phai_sinh_batch_items_batch_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phai_sinh_batch_items
    ADD CONSTRAINT phai_sinh_batch_items_batch_ticket_id_fkey FOREIGN KEY (batch_ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: phai_sinh_batch_items phai_sinh_batch_items_pic_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phai_sinh_batch_items
    ADD CONSTRAINT phai_sinh_batch_items_pic_profile_id_fkey FOREIGN KEY (pic_profile_id) REFERENCES public.profiles(id);


--
-- Name: profiles profiles_auth_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_auth_id_fkey FOREIGN KEY (auth_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: release_dsp_links release_dsp_links_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_dsp_links
    ADD CONSTRAINT release_dsp_links_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.releases(id) ON DELETE CASCADE;


--
-- Name: release_package_items release_package_items_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_package_items
    ADD CONSTRAINT release_package_items_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.releases(id) ON DELETE CASCADE;


--
-- Name: release_stream_metrics release_stream_metrics_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_stream_metrics
    ADD CONSTRAINT release_stream_metrics_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.releases(id) ON DELETE CASCADE;


--
-- Name: release_tracks release_tracks_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_tracks
    ADD CONSTRAINT release_tracks_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.releases(id) ON DELETE CASCADE;


--
-- Name: releases releases_pitching_pic_apple_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.releases
    ADD CONSTRAINT releases_pitching_pic_apple_fkey FOREIGN KEY (pitching_pic_apple) REFERENCES public.profiles(id);


--
-- Name: releases releases_pitching_pic_domestic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.releases
    ADD CONSTRAINT releases_pitching_pic_domestic_fkey FOREIGN KEY (pitching_pic_domestic) REFERENCES public.profiles(id);


--
-- Name: releases releases_pitching_pic_priority_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.releases
    ADD CONSTRAINT releases_pitching_pic_priority_fkey FOREIGN KEY (pitching_pic_priority) REFERENCES public.profiles(id);


--
-- Name: releases releases_pitching_pic_spotify_banner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.releases
    ADD CONSTRAINT releases_pitching_pic_spotify_banner_fkey FOREIGN KEY (pitching_pic_spotify_banner) REFERENCES public.profiles(id);


--
-- Name: releases releases_pitching_pic_spotify_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.releases
    ADD CONSTRAINT releases_pitching_pic_spotify_fkey FOREIGN KEY (pitching_pic_spotify) REFERENCES public.profiles(id);


--
-- Name: team_building_survey_responses team_building_survey_responses_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_building_survey_responses
    ADD CONSTRAINT team_building_survey_responses_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: tickets tickets_pic_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pic_profile_id_fkey FOREIGN KEY (pic_profile_id) REFERENCES public.profiles(id);


--
-- Name: tickets tickets_tab_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_tab_id_fkey FOREIGN KEY (tab_id) REFERENCES public.ticket_tabs(id);


--
-- Name: workstation_assignments workstation_assignments_pic_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workstation_assignments
    ADD CONSTRAINT workstation_assignments_pic_profile_id_fkey FOREIGN KEY (pic_profile_id) REFERENCES public.profiles(id);


--
-- Name: workstation_assignments workstation_assignments_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workstation_assignments
    ADD CONSTRAINT workstation_assignments_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.releases(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 94Sh9oioCtXS3kvMParWMfdWWvysQRy5igcWSbQTRdyIhhPItM3zhTMQZtDXgn3

