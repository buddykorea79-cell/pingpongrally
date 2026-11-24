-- =====================================================================
-- PingPongRally 초기 스키마 (설계서 10·11·12장)
--   테이블 10개 + RLS + 서버 함수(security definer) + 실시간 + 스토리지
--   Supabase SQL Editor 에 통째로 붙여 넣거나 `supabase db push` 로 적용한다.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 0. 공용 도구
-- ---------------------------------------------------------------------
create or replace function public.try_uuid(p text)
returns uuid language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

create or replace function public.is_anonymous_user()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

-- 참석자 등록 링크용 토큰(12자, 추측 불가). gen_random_uuid 는 강한 난수를 쓴다.
create or replace function public.new_reg_token()
returns text language sql volatile as $$
  select substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 12)
$$;

-- ---------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------
create table public.rooms (
  id                uuid primary key default gen_random_uuid(),
  code              text check (code is null or code ~ '^[1-9][0-9]{5}$'),
  title             text not null check (char_length(title) between 1 and 80),
  host_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status            text not null default 'draft' check (status in ('draft', 'live', 'closed')),
  -- 참석자 등록: 설문처럼 링크로 보내는 폼. off(안 받음) → open(받는 중) → closed(마감)
  registration      text not null default 'off' check (registration in ('off', 'open', 'closed')),
  reg_token         text not null default public.new_reg_token() check (reg_token ~ '^[0-9a-f]{12}$'),
  collect_phone     boolean not null default false,
  consent_version   int not null default 1,
  controller_name   text not null default '' check (char_length(controller_name) <= 80),
  contact           text not null default '' check (char_length(contact) <= 120),
  phone_purpose     text not null default '' check (char_length(phone_purpose) <= 120),
  active_ping_id    uuid,
  present           jsonb not null default '{"view": "board", "showQr": true, "surveyShare": null}'::jsonb,
  moderation_rev    int not null default 0,
  started_at        timestamptz,
  expires_at        timestamptz,
  closed_at         timestamptz,
  purge_content_at  timestamptz,
  purge_pii_at      timestamptz,
  content_purged_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- 진행 중인 강의실끼리 입장 코드가 겹치지 않게 한다.
create unique index rooms_live_code_uniq on public.rooms (code) where status = 'live';
create unique index rooms_reg_token_uniq on public.rooms (reg_token);
-- 한 강사(계정)가 동시에 열 수 있는 강의실(준비·진행)은 1개뿐이다. 경쟁 상태에서도 DB가 막는다.
create unique index rooms_one_open_per_host on public.rooms (host_id) where status <> 'closed';
create index rooms_host_idx on public.rooms (host_id);
create index rooms_purge_content_idx on public.rooms (purge_content_at) where content_purged_at is null;
create index rooms_purge_pii_idx on public.rooms (purge_pii_at);

create table public.room_members (
  room_id   uuid not null references public.rooms(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  nickname  text not null check (char_length(nickname) between 2 and 12),
  color     text not null default '#5A68F8',
  is_host   boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create unique index room_members_nickname_uniq on public.room_members (room_id, lower(nickname));
create index room_members_user_idx on public.room_members (user_id);

create table public.rosters (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  org         text not null default '' check (char_length(org) <= 60),
  dept        text not null default '' check (char_length(dept) <= 60),
  name        text not null check (char_length(name) between 1 and 40),
  phone_last4 text check (phone_last4 is null or phone_last4 ~ '^[0-9]{4}$'),
  created_at  timestamptz not null default now()
);
create index rosters_room_idx on public.rosters (room_id);

create table public.participants (
  id                  uuid primary key default gen_random_uuid(),
  room_id             uuid not null references public.rooms(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  org                 text not null check (char_length(org) between 1 and 60),
  dept                text not null check (char_length(dept) between 1 and 60),
  name                text not null check (char_length(name) between 1 and 40),
  phone               text check (phone is null or phone ~ '^010-[0-9]{4}-[0-9]{4}$'),
  consent_version     int not null,
  consent_required_at timestamptz not null,
  consent_optional_at timestamptz,
  roster_id           uuid references public.rosters(id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (room_id, user_id)
);
create index participants_user_idx on public.participants (user_id);

create table public.nodes (
  id              uuid primary key default gen_random_uuid(),
  room_id         uuid not null references public.rooms(id) on delete cascade,
  ping_id         uuid references public.nodes(id) on delete cascade,
  parent_id       uuid references public.nodes(id) on delete cascade,
  type            text not null check (type in ('ping', 'pong', 'reply', 'poll')),
  author_id       uuid not null default auth.uid(),
  author_nickname text not null default '',
  is_host         boolean not null default false,
  content         text not null default '' check (char_length(content) <= 2000),
  attachments     jsonb not null default '[]'::jsonb
                  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10),
  meta            jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object'),
  is_hidden       boolean not null default false,
  is_closed       boolean not null default false,
  sort_order      double precision not null default 0,
  opened_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index nodes_room_updated_idx on public.nodes (room_id, updated_at);
create index nodes_ping_idx on public.nodes (ping_id);
create index nodes_parent_idx on public.nodes (parent_id);
create index nodes_author_idx on public.nodes (author_id);

alter table public.rooms
  add constraint rooms_active_ping_fk foreign key (active_ping_id) references public.nodes(id) on delete set null;

create table public.poll_votes (
  node_id    uuid not null references public.nodes(id) on delete cascade,
  user_id    uuid not null default auth.uid(),
  option_ids text[] not null check (cardinality(option_ids) between 1 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (node_id, user_id)
);
create index poll_votes_user_idx on public.poll_votes (user_id);

-- 퐁 이모지 반응: 사람마다 퐁 하나에 한 행(고른 이모지 목록). 개수는 toggle_reaction 이
-- nodes.meta.reactions 에 모아 두어, 기존 nodes 실시간 채널로 모두에게 퍼진다.
create table public.node_reactions (
  node_id    uuid not null references public.nodes(id) on delete cascade,
  user_id    uuid not null default auth.uid(),
  kinds      text[] not null default '{}' check (kinds <@ array['like', 'dislike', 'heart', 'laugh', 'wow', 'think']::text[]),
  updated_at timestamptz not null default now(),
  primary key (node_id, user_id)
);
create index node_reactions_user_idx on public.node_reactions (user_id);

create table public.survey_templates (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  questions   jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  updated_at  timestamptz not null default now()
);
create index survey_templates_owner_idx on public.survey_templates (owner_id);

create table public.room_surveys (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  template_id uuid references public.survey_templates(id) on delete set null,
  title       text not null,
  description text not null default '',
  questions   jsonb not null check (jsonb_typeof(questions) = 'array'),
  timing      text not null check (timing in ('pre', 'live', 'post')),
  anonymous   boolean not null default true,
  status      text not null default 'ready' check (status in ('ready', 'open', 'closed')),
  opens_at    timestamptz,
  closes_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index room_surveys_room_idx on public.room_surveys (room_id);

create table public.survey_responses (
  id             uuid primary key default gen_random_uuid(),
  room_survey_id uuid not null references public.room_surveys(id) on delete cascade,
  room_id        uuid not null references public.rooms(id) on delete cascade,
  user_id        uuid not null default auth.uid(),
  answers        jsonb not null check (jsonb_typeof(answers) = 'object'),
  submitted_at   timestamptz not null default now(),
  unique (room_survey_id, user_id)
);
create index survey_responses_user_idx on public.survey_responses (user_id);
create index survey_responses_room_idx on public.survey_responses (room_id);

create table public.ping_sets (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 100),
  pings      jsonb not null default '[]'::jsonb check (jsonb_typeof(pings) = 'array'),
  updated_at timestamptz not null default now()
);
create index ping_sets_owner_idx on public.ping_sets (owner_id);

-- 강의실 생성 기록(하루 생성 한도용). 강의실을 지워도 기록은 남아 '만들고 지우기' 반복을 막는다.
-- 클라이언트는 읽거나 쓸 수 없다(정책 없음). 2일이 지나면 close_expired_rooms 가 지운다.
create table public.room_creations (
  host_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index room_creations_host_idx on public.room_creations (host_id, created_at);

-- 입장 코드를 틀린 기록(숫자 6자리라 마구 넣어 보기를 막는다). 클라이언트는 읽거나 쓸 수 없다.
create table public.code_attempts (
  user_id    uuid not null,
  created_at timestamptz not null default now()
);
create index code_attempts_user_idx on public.code_attempts (user_id, created_at);

-- ---------------------------------------------------------------------
-- 2. 권한 판단 함수 (RLS 재귀를 피하려고 security definer)
-- ---------------------------------------------------------------------
create or replace function public.is_room_host(p_room uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.rooms r where r.id = p_room and r.host_id = (select auth.uid()))
$$;

create or replace function public.is_room_member(p_room uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.room_members m where m.room_id = p_room and m.user_id = (select auth.uid()))
$$;

-- 진행 중이고 만료 전인가
create or replace function public.room_is_open(p_room uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.rooms r where r.id = p_room and r.status = 'live' and r.expires_at > now())
$$;

create or replace function public.poll_is_open(p_node uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.nodes n
    join public.rooms r on r.id = n.room_id
    where n.id = p_node and n.type = 'poll' and n.meta ->> 'status' = 'open' and not n.is_closed
      and r.status = 'live' and r.expires_at > now()
  )
$$;

create or replace function public.survey_is_open(p_survey uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.room_surveys s
    join public.rooms r on r.id = s.room_id
    where s.id = p_survey and s.status = 'open' and r.status = 'live' and r.expires_at > now()
  )
$$;

-- 투표 가능: 열린 퀵폴 + 그 강의실 참여자
create or replace function public.can_vote(p_node uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.poll_is_open(p_node) and exists (
    select 1 from public.nodes n
    join public.room_members m on m.room_id = n.room_id and m.user_id = (select auth.uid())
    where n.id = p_node
  )
$$;

-- 설문 응답 가능: 열린 설문 + 그 강의실 참여자
create or replace function public.can_respond(p_survey uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.survey_is_open(p_survey) and exists (
    select 1 from public.room_surveys s
    join public.room_members m on m.room_id = s.room_id and m.user_id = (select auth.uid())
    where s.id = p_survey
  )
$$;

-- ---------------------------------------------------------------------
-- 3. 트리거
-- ---------------------------------------------------------------------
-- 강의실 생성 규칙
--   · 강사 1명(계정)은 준비·진행 중인 강의실을 1개만 가질 수 있다(봇·중복 생성 방지).
--   · 24시간 동안 만들 수 있는 강의실은 3개까지(만들고 종료·삭제를 반복하는 봇 방지).
--   · 상태·코드·시각 같은 값은 클라이언트가 보내도 무시하고 서버가 정한다.
create or replace function public.rooms_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.host_id is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('room:' || new.host_id::text, 0));
  if exists (select 1 from public.rooms where host_id = new.host_id and status <> 'closed') then
    raise exception 'room_limit' using errcode = '23505';
  end if;
  if (select count(*) from public.room_creations
       where host_id = new.host_id and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'room_daily_limit' using errcode = '54000';
  end if;
  insert into public.room_creations (host_id) values (new.host_id);

  new.status := 'draft';
  new.code := null;
  new.registration := 'off';
  new.reg_token := public.new_reg_token();
  new.consent_version := 1;
  new.active_ping_id := null;
  new.moderation_rev := 0;
  new.started_at := null;
  new.expires_at := null;
  new.closed_at := null;
  new.purge_content_at := null;
  new.purge_pii_at := null;
  new.content_purged_at := null;
  new.created_at := now();
  new.updated_at := now();
  return new;
end $$;
create trigger rooms_before_insert before insert on public.rooms
  for each row execute function public.rooms_before_insert();

create or replace function public.rooms_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  -- 동의 문안에 들어가는 값이 바뀌면 문안 버전을 올린다(6.4).
  if (new.title, new.controller_name, new.contact, new.phone_purpose, new.collect_phone)
     is distinct from
     (old.title, old.controller_name, old.contact, old.phone_purpose, old.collect_phone) then
    new.consent_version := old.consent_version + 1;
  end if;
  -- 등록 폼을 열려면 동의 문안의 개인정보처리자가 있어야 한다.
  if new.registration = 'open' and old.registration is distinct from 'open' then
    if btrim(new.controller_name) = '' then raise exception 'controller_required' using errcode = '22023'; end if;
    if new.status = 'closed' then raise exception 'room_closed' using errcode = '22023'; end if;
    -- 강의를 시작하지 않은 채 남는 등록 정보도 기한을 둔다(시작하면 종료 7일 뒤로 다시 정해진다).
    if new.purge_pii_at is null then new.purge_pii_at := now() + interval '30 days'; end if;
  end if;
  -- 포커스한 핑은 교육생에게 공개된다.
  if new.active_ping_id is distinct from old.active_ping_id and new.active_ping_id is not null then
    if not exists (select 1 from public.nodes n where n.id = new.active_ping_id and n.room_id = new.id and n.type in ('ping', 'poll')) then
      raise exception 'invalid_focus' using errcode = '22023';
    end if;
    update public.nodes set opened_at = now() where id = new.active_ping_id and opened_at is null;
  end if;
  return new;
end $$;
create trigger rooms_before_update before update on public.rooms
  for each row execute function public.rooms_before_update();

create or replace function public.validate_attachments(p jsonb)
returns boolean language sql immutable as $$
  select coalesce(bool_and(
    (a ->> 'kind') in ('image', 'file', 'link')
    and (a ->> 'url') ~* '^https?://'
    and coalesce(a ->> 'thumb_url', 'https://') ~* '^https?://'
    and char_length(coalesce(a ->> 'name', '')) <= 200
  ), true)
  from jsonb_array_elements(p) a
$$;

create or replace function public.nodes_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_room    public.rooms;
  v_parent  public.nodes;
  v_ping    public.nodes;
  v_is_host boolean;
  v_nick    text;
  v_opts    int;
begin
  select * into v_room from public.rooms where id = new.room_id;
  if v_room.id is null then raise exception 'room_not_found' using errcode = 'P0002'; end if;
  v_is_host := v_room.host_id = auth.uid();
  if auth.uid() is not null then new.author_id := auth.uid(); end if;

  if new.type in ('ping', 'poll') then
    if new.parent_id is not null then raise exception 'ping_has_no_parent' using errcode = '22023'; end if;
    new.ping_id := new.id;
    new.opened_at := null;
    if new.type = 'poll' then
      v_opts := jsonb_array_length(coalesce(new.meta -> 'options', '[]'::jsonb));
      if v_opts < 2 or v_opts > 6 then raise exception 'poll_needs_2_to_6_options' using errcode = '22023'; end if;
      new.meta := jsonb_set(new.meta, '{status}', '"ready"');
    end if;
    if new.sort_order = 0 then
      select coalesce(max(sort_order), 0) + 1 into new.sort_order
      from public.nodes where room_id = new.room_id and type in ('ping', 'poll');
    end if;
  elsif new.type = 'pong' then
    select * into v_parent from public.nodes where id = new.parent_id;
    if v_parent.id is null or v_parent.type <> 'ping' or v_parent.room_id <> new.room_id then
      raise exception 'pong_parent_must_be_ping' using errcode = '22023';
    end if;
    if v_parent.is_closed then raise exception 'ping_closed' using errcode = '22023'; end if;
    if v_parent.opened_at is null and not v_is_host then raise exception 'ping_not_open' using errcode = '22023'; end if;
    new.ping_id := v_parent.id;
  elsif new.type = 'reply' then
    select * into v_parent from public.nodes where id = new.parent_id;
    if v_parent.id is null or v_parent.type <> 'pong' or v_parent.room_id <> new.room_id then
      raise exception 'reply_parent_must_be_pong' using errcode = '22023';
    end if;
    select * into v_ping from public.nodes where id = v_parent.ping_id;
    if v_ping.is_closed then raise exception 'ping_closed' using errcode = '22023'; end if;
    new.ping_id := v_parent.ping_id;
  end if;

  if new.type in ('pong', 'reply') then
    -- 반응 개수 등은 서버만 쓴다
    new.meta := '{}'::jsonb;
    if char_length(new.content) > 1000 then
      raise exception 'content_too_long' using errcode = '22001';
    end if;
  end if;
  if char_length(btrim(new.content)) = 0 and jsonb_array_length(new.attachments) = 0 then
    raise exception 'empty_content' using errcode = '22023';
  end if;
  if not public.validate_attachments(new.attachments) then
    raise exception 'invalid_attachment' using errcode = '22023';
  end if;

  if v_is_host then
    new.is_host := true;
    new.author_nickname := '강사';
  else
    select nickname into v_nick from public.room_members where room_id = new.room_id and user_id = auth.uid();
    new.is_host := false;
    new.author_nickname := coalesce(v_nick, '');
  end if;

  new.is_hidden := false;
  new.is_closed := false;
  new.created_at := now();
  new.updated_at := now();
  return new;
end $$;
create trigger nodes_before_insert before insert on public.nodes
  for each row execute function public.nodes_before_insert();

create or replace function public.nodes_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_is_host boolean;
begin
  if new.id <> old.id or new.room_id <> old.room_id or new.type <> old.type
     or new.parent_id is distinct from old.parent_id or new.ping_id is distinct from old.ping_id
     or new.author_id <> old.author_id or new.created_at <> old.created_at then
    raise exception 'immutable_column' using errcode = '42501';
  end if;

  v_is_host := auth.uid() is null or public.is_room_host(old.room_id);

  if not v_is_host then
    -- 작성자는 내용·첨부 수정과 '삭제(숨김)'만 할 수 있다.
    if new.is_closed <> old.is_closed or new.sort_order <> old.sort_order
       or new.opened_at is distinct from old.opened_at or new.is_host <> old.is_host
       or new.author_nickname <> old.author_nickname
       or (new.meta <> old.meta and not (
             coalesce(current_setting('ppr.reaction', true), '') = 'on'
             and (new.meta - 'reactions') = (old.meta - 'reactions'))) then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    if old.is_hidden and not new.is_hidden then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    if not public.room_is_open(old.room_id) then
      raise exception 'room_closed' using errcode = '42501';
    end if;
  end if;

  if new.type in ('pong', 'reply') and char_length(new.content) > 1000 then
    raise exception 'content_too_long' using errcode = '22001';
  end if;
  if not public.validate_attachments(new.attachments) then
    raise exception 'invalid_attachment' using errcode = '22023';
  end if;

  if new.type = 'poll' then
    new.is_closed := coalesce(new.meta ->> 'status', 'ready') = 'closed';
    if new.meta ->> 'status' = 'open' and new.opened_at is null then
      new.opened_at := now();
    end if;
  end if;

  new.updated_at := now();

  -- 숨김은 교육생이 실시간으로 받지 못하므로(RLS), 강의실 번호를 올려 전체 다시 조회를 알린다.
  if new.is_hidden <> old.is_hidden then
    update public.rooms set moderation_rev = moderation_rev + 1 where id = new.room_id;
  end if;
  return new;
end $$;
create trigger nodes_before_update before update on public.nodes
  for each row execute function public.nodes_before_update();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger survey_templates_touch before update on public.survey_templates
  for each row execute function public.touch_updated_at();
create trigger ping_sets_touch before update on public.ping_sets
  for each row execute function public.touch_updated_at();
create trigger poll_votes_touch before update on public.poll_votes
  for each row execute function public.touch_updated_at();

-- 강사 템플릿은 계정마다 100개까지(공개 가입을 열었으므로 봇이 무한히 쌓지 못하게)
create or replace function public.enforce_owner_quota()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  execute format('select count(*) from public.%I where owner_id = $1', tg_table_name) into n using new.owner_id;
  if n >= 100 then raise exception 'quota_exceeded' using errcode = '54000'; end if;
  return new;
end $$;
create trigger ping_sets_quota before insert on public.ping_sets
  for each row execute function public.enforce_owner_quota();
create trigger survey_templates_quota before insert on public.survey_templates
  for each row execute function public.enforce_owner_quota();

create or replace function public.survey_responses_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.room_id := (select s.room_id from public.room_surveys s where s.id = new.room_survey_id);
  new.submitted_at := now();
  if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.room_survey_id <> old.room_survey_id) then
    raise exception 'immutable_column' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger survey_responses_before_write before insert or update on public.survey_responses
  for each row execute function public.survey_responses_before_write();

-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------
alter table public.rooms            enable row level security;
alter table public.room_members     enable row level security;
alter table public.participants     enable row level security;
alter table public.rosters          enable row level security;
alter table public.nodes            enable row level security;
alter table public.poll_votes       enable row level security;
alter table public.node_reactions   enable row level security;
alter table public.code_attempts    enable row level security;
alter table public.room_surveys     enable row level security;
alter table public.survey_responses enable row level security;
alter table public.ping_sets        enable row level security;
alter table public.survey_templates enable row level security;
alter table public.room_creations   enable row level security; -- 정책 없음: 클라이언트 접근 불가

-- 로그인하지 않은 접근(anon 역할)은 테이블에 닿지 못한다.
revoke all on all tables in schema public from anon;

-- rooms: 개인정보가 없는 행이라 입장한 참여자도 실시간 포커스를 받도록 행을 읽는다.
create policy rooms_select on public.rooms for select to authenticated
  using (host_id = (select auth.uid()) or public.is_room_member(id));
create policy rooms_insert on public.rooms for insert to authenticated
  with check (host_id = (select auth.uid()) and not public.is_anonymous_user());
create policy rooms_update on public.rooms for update to authenticated
  using (host_id = (select auth.uid())) with check (host_id = (select auth.uid()));
create policy rooms_delete on public.rooms for delete to authenticated
  using (host_id = (select auth.uid()) and status = 'draft');
-- 상태·시각·코드는 서버 함수로만 바꾼다(열 단위 권한).
revoke update on public.rooms from authenticated;
grant update (title, registration, collect_phone, controller_name, contact, phone_purpose, active_ping_id, present)
  on public.rooms to authenticated;

create policy room_members_select on public.room_members for select to authenticated
  using (public.is_room_member(room_id) or public.is_room_host(room_id));

create policy participants_select on public.participants for select to authenticated
  using (user_id = (select auth.uid()) or public.is_room_host(room_id));
create policy participants_delete on public.participants for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_room_host(room_id));

create policy rosters_all on public.rosters for all to authenticated
  using (public.is_room_host(room_id)) with check (public.is_room_host(room_id));

-- 작성자는 자기 글을 숨김(삭제) 상태여도 읽을 수 있어야 한다.
-- (UPDATE 결과 행도 SELECT 정책을 통과해야 하므로, 이게 없으면 '삭제'가 RLS 에 막힌다)
create policy nodes_select on public.nodes for select to authenticated
  using (
    public.is_room_host(room_id)
    or author_id = (select auth.uid())
    or (public.is_room_member(room_id) and not is_hidden and (type in ('pong', 'reply') or opened_at is not null))
  );
create policy nodes_insert on public.nodes for insert to authenticated
  with check (
    (type in ('ping', 'poll') and public.is_room_host(room_id))
    or (
      type in ('pong', 'reply')
      and author_id = (select auth.uid())
      and (public.is_room_member(room_id) or public.is_room_host(room_id))
      and public.room_is_open(room_id)
    )
  );
create policy nodes_update on public.nodes for update to authenticated
  using (author_id = (select auth.uid()) or public.is_room_host(room_id))
  with check (author_id = (select auth.uid()) or public.is_room_host(room_id));

create policy poll_votes_select on public.poll_votes for select to authenticated
  using (user_id = (select auth.uid()));
create policy poll_votes_insert on public.poll_votes for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_vote(node_id));
create policy poll_votes_update on public.poll_votes for update to authenticated
  using (user_id = (select auth.uid()) and public.can_vote(node_id))
  with check (user_id = (select auth.uid()) and public.can_vote(node_id));

-- 반응은 toggle_reaction 으로만 쓴다. 직접 읽기는 자기 것만.
create policy node_reactions_select on public.node_reactions for select to authenticated
  using (user_id = (select auth.uid()));

create policy room_surveys_select on public.room_surveys for select to authenticated
  using (public.is_room_member(room_id) or public.is_room_host(room_id));
create policy room_surveys_write on public.room_surveys for all to authenticated
  using (public.is_room_host(room_id)) with check (public.is_room_host(room_id));

create policy survey_responses_select on public.survey_responses for select to authenticated
  using (user_id = (select auth.uid()));
create policy survey_responses_insert on public.survey_responses for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_respond(room_survey_id));
create policy survey_responses_update on public.survey_responses for update to authenticated
  using (user_id = (select auth.uid()) and public.can_respond(room_survey_id))
  with check (user_id = (select auth.uid()) and public.can_respond(room_survey_id));

create policy ping_sets_owner on public.ping_sets for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and not public.is_anonymous_user());
create policy survey_templates_owner on public.survey_templates for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and not public.is_anonymous_user());

-- ---------------------------------------------------------------------
-- 5. 서버 함수 (11.1)
-- ---------------------------------------------------------------------
-- 입장 코드: 숫자 6자리(100000~999999). 휴대폰 숫자 자판으로 바로 넣을 수 있게.
create or replace function public.generate_room_code()
returns text language sql volatile set search_path = '' as $$
  select (100000 + (('x' || lpad(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), 16, '0'))::bit(64)::bigint % 900000))::text
$$;

-- 입력한 코드에서 숫자만 남긴다('123 456', '123-456' 도 받아 준다)
create or replace function public.normalize_room_code(p_code text)
returns text language sql immutable set search_path = '' as $$
  select left(regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g'), 6)
$$;

-- 틀린 코드를 10분에 20번 넘게 넣으면 잠시 막는다(숫자 6자리 마구 넣어 보기 방지)
create or replace function public.check_code_attempts()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.code_attempts
       where user_id = auth.uid() and created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'too_many_attempts' using errcode = '54000';
  end if;
end $$;

-- 강의 시작: 입장 코드 발급, 만료(시작+24h), 파기 시각 지정, 사전 설문 열기
create or replace function public.start_room(p_room uuid)
returns public.rooms language plpgsql security definer set search_path = '' as $$
declare
  r public.rooms;
  i int;
begin
  select * into r from public.rooms where id = p_room for update;
  if r.id is null or r.host_id <> auth.uid() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if r.status <> 'draft' then raise exception 'already_started' using errcode = '22023'; end if;

  for i in 1..30 loop
    begin
      update public.rooms
         set status = 'live',
             code = public.generate_room_code(),
             started_at = now(),
             expires_at = now() + interval '24 hours',
             purge_content_at = now() + interval '72 hours',
             purge_pii_at = now() + interval '24 hours' + interval '7 days'
       where id = p_room
       returning * into r;
      exit;
    exception when unique_violation then
      -- 코드가 겹치면 다시 뽑는다
    end;
  end loop;
  if r.status <> 'live' then raise exception 'code_generation_failed'; end if;

  update public.room_surveys set status = 'open', opens_at = now()
   where room_id = p_room and timing = 'pre' and status = 'ready';
  return r;
end $$;

-- 연장: 만료·글 파기·개인정보 파기 시각을 함께 늦춘다. 강의 시간은 시작 후 최대 48시간.
create or replace function public.extend_room(p_room uuid, p_hours int)
returns public.rooms language plpgsql security definer set search_path = '' as $$
declare
  r public.rooms;
  v_new timestamptz;
  v_delta interval;
begin
  select * into r from public.rooms where id = p_room for update;
  if r.id is null or r.host_id <> auth.uid() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if r.status <> 'live' then raise exception 'not_live' using errcode = '22023'; end if;
  if p_hours < 1 or p_hours > 24 then raise exception 'invalid_hours' using errcode = '22023'; end if;

  v_new := least(greatest(r.expires_at, now()) + make_interval(hours => p_hours), r.started_at + interval '48 hours');
  v_delta := v_new - r.expires_at;
  if v_delta <= interval '0' then raise exception 'extension_limit' using errcode = '22023'; end if;

  update public.rooms
     set expires_at = v_new,
         purge_content_at = purge_content_at + v_delta,
         purge_pii_at = purge_pii_at + v_delta
   where id = p_room
   returning * into r;
  return r;
end $$;

-- 즉시 종료: 개인정보는 종료 7일 뒤 파기
create or replace function public.close_room(p_room uuid)
returns public.rooms language plpgsql security definer set search_path = '' as $$
declare
  r public.rooms;
begin
  select * into r from public.rooms where id = p_room for update;
  if r.id is null or r.host_id <> auth.uid() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if r.status = 'closed' then return r; end if;
  if r.status = 'draft' then raise exception 'not_live' using errcode = '22023'; end if;

  update public.rooms
     set status = 'closed',
         closed_at = now(),
         expires_at = least(expires_at, now()),
         registration = case when registration = 'open' then 'closed' else registration end,
         purge_pii_at = now() + interval '7 days'
   where id = p_room
   returning * into r;
  update public.room_surveys set status = 'closed', closes_at = now() where room_id = p_room and status = 'open';
  return r;
end $$;

-- 만료 시각이 지난 강의실을 종료 상태로 바꾼다(pg_cron).
create or replace function public.close_expired_rooms()
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  update public.room_surveys s set status = 'closed', closes_at = now()
    from public.rooms r
   where s.room_id = r.id and s.status = 'open' and r.status = 'live' and r.expires_at <= now();
  update public.rooms
     set status = 'closed',
         closed_at = expires_at,
         registration = case when registration = 'open' then 'closed' else registration end
   where status = 'live' and expires_at <= now();
  get diagnostics n = row_count;
  delete from public.room_creations where created_at < now() - interval '2 days';
  delete from public.code_attempts where created_at < now() - interval '1 day';
  return n;
end $$;

-- 입장 전 코드로 공개 정보만 조회
create or replace function public.room_lookup(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  perform public.check_code_attempts();
  select jsonb_build_object(
    'id', r.id,
    'title', r.title,
    'status', r.status,
    'expires_at', r.expires_at,
    'pre_survey', (
      select to_jsonb(s) from public.room_surveys s
      where s.room_id = r.id and s.timing = 'pre' and s.status = 'open'
      order by s.created_at limit 1
    )
  )
  into v
  from public.rooms r
  where r.code = public.normalize_room_code(p_code) and r.status = 'live' and r.expires_at > now();
  if v is null then
    insert into public.code_attempts (user_id) values (auth.uid());
  end if;
  return v;
end $$;

-- 참석자 등록 링크(/reg/:token)로 공개 정보만 조회. 강의가 진행 중이면 바로 입장할 수 있게 코드도 준다.
create or replace function public.registration_lookup(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'room_id', r.id,
    'title', r.title,
    'room_status', case when r.status = 'live' and r.expires_at <= now() then 'closed' else r.status end,
    'registration', r.registration,
    'code', case when r.status = 'live' and r.expires_at > now() then r.code end,
    'collect_phone', r.collect_phone,
    'consent_version', r.consent_version,
    'controller_name', r.controller_name,
    'contact', r.contact,
    'phone_purpose', r.phone_purpose,
    'purge_pii_at', r.purge_pii_at,
    'roster_orgs', coalesce((
      select jsonb_agg(distinct ro.org) from public.rosters ro where ro.room_id = r.id and ro.org <> ''
    ), '[]'::jsonb)
  )
  from public.rooms r
  where r.reg_token = lower(btrim(p_token)) and r.registration <> 'off'
$$;

-- 참석자 등록(내부용). 필수 동의가 없으면 거부, 선택 동의가 없으면 휴대폰 번호를 버린다.
create or replace function public._register_participant(p_room public.rooms, p_uid uuid, p jsonb)
returns public.participants language plpgsql security definer set search_path = '' as $$
declare
  v_org    text := btrim(coalesce(p ->> 'org', ''));
  v_dept   text := btrim(coalesce(p ->> 'dept', ''));
  v_name   text := btrim(coalesce(p ->> 'name', ''));
  v_phone  text := nullif(btrim(coalesce(p ->> 'phone', '')), '');
  v_opt    boolean := coalesce((p ->> 'consent_optional')::boolean, false);
  v_roster uuid;
  v_row    public.participants;
begin
  if not coalesce((p ->> 'consent_required')::boolean, false) then
    raise exception 'consent_required' using errcode = '22023';
  end if;
  if v_org = '' or v_dept = '' or v_name = '' then raise exception 'missing_fields' using errcode = '22023'; end if;
  if not (p_room.collect_phone and v_opt) then
    v_phone := null;
    v_opt := false;
  end if;

  -- 사전 명단 대조: 성명 + 휴대폰 뒤 4자리, 없으면 기관 + 성명
  select ro.id into v_roster
    from public.rosters ro
   where ro.room_id = p_room.id
     and ro.name = v_name
     and (
       (ro.phone_last4 is not null and v_phone is not null and ro.phone_last4 = right(regexp_replace(v_phone, '[^0-9]', '', 'g'), 4))
       or ro.org = v_org
     )
   order by (ro.phone_last4 is not null and v_phone is not null) desc
   limit 1;

  insert into public.participants as pa
    (room_id, user_id, org, dept, name, phone, consent_version, consent_required_at, consent_optional_at, roster_id)
  values
    (p_room.id, p_uid, v_org, v_dept, v_name, v_phone, p_room.consent_version, now(),
     case when v_opt then now() end, v_roster)
  on conflict (room_id, user_id) do update
     set org = excluded.org, dept = excluded.dept, name = excluded.name, phone = excluded.phone,
         consent_version = excluded.consent_version,
         consent_required_at = excluded.consent_required_at,
         consent_optional_at = excluded.consent_optional_at,
         roster_id = excluded.roster_id
  returning * into v_row;
  return v_row;
end $$;
revoke execute on function public._register_participant(public.rooms, uuid, jsonb) from public, anon, authenticated;

-- 입장: 진행 중·만료 전인지 확인하고 room_members에 추가한다.
-- 참석자 등록은 입장과 분리되어 있다(강사가 보낸 등록 링크로 따로 받는다).
create or replace function public.join_room(p_code text, p_nickname text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  r       public.rooms;
  v_uid   uuid := auth.uid();
  v_nick  text := btrim(coalesce(p_nickname, ''));
  v_colors text[] := array['#FF6A3D','#5A68F8','#15B596','#9157FB','#F2A516','#E5484D','#0EA5E9','#D946EF','#22A06B','#F97316','#6366F1','#14B8A6'];
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  perform public.check_code_attempts();
  select * into r from public.rooms
   where code = public.normalize_room_code(p_code) and status = 'live' and expires_at > now();
  if r.id is null then
    -- 예외를 던지면 기록도 함께 되돌려지므로, 기록하고 null 을 돌려준다(클라이언트가 room_not_found 로 바꿔 보여 줌)
    insert into public.code_attempts (user_id) values (v_uid);
    return null;
  end if;

  if exists (select 1 from public.room_members where room_id = r.id and user_id = v_uid) then
    return r.id;
  end if;

  if char_length(v_nick) < 2 or char_length(v_nick) > 12 then
    raise exception 'invalid_nickname' using errcode = '22023';
  end if;
  if v_nick = '강사' or exists (
    select 1 from public.room_members where room_id = r.id and lower(nickname) = lower(v_nick)
  ) then
    raise exception 'nickname_taken' using errcode = '23505';
  end if;

  insert into public.room_members (room_id, user_id, nickname, color, is_host)
  values (r.id, v_uid, v_nick, v_colors[1 + floor(random() * array_length(v_colors, 1))::int], r.host_id = v_uid);
  return r.id;
end $$;

-- 등록 링크로 참석자 등록(설문처럼). 강의 시작 전(준비 중)에도 받을 수 있고, 같은 사람은 고쳐 쓴다.
-- 강의 당일 같은 브라우저로 입장하면 등록 정보와 닉네임이 자동으로 이어진다(user_id 가 같다).
create or replace function public.register_by_token(p_token text, p_registration jsonb)
returns public.participants language plpgsql security definer set search_path = '' as $$
declare
  r public.rooms;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into r from public.rooms where reg_token = lower(btrim(p_token)) for share;
  if r.id is null or r.registration = 'off' then raise exception 'registration_not_found' using errcode = 'P0002'; end if;
  if r.registration <> 'open' or r.status = 'closed' or (r.status = 'live' and r.expires_at <= now()) then
    raise exception 'registration_closed' using errcode = '22023';
  end if;
  if not exists (select 1 from public.participants where room_id = r.id and user_id = auth.uid())
     and (select count(*) from public.participants where room_id = r.id) >= 1000 then
    raise exception 'registration_full' using errcode = '54000';
  end if;
  return public._register_participant(r, auth.uid(), p_registration);
end $$;

-- 퀵폴 집계: 누가 어디에 투표했는지는 돌려주지 않는다.
-- 퐁 반응 켜고 끄기. 돌려주는 값: { "mine": 내가 고른 것, "reactions": { like: 3, ... } }
create or replace function public.toggle_reaction(p_node uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  n        public.nodes;
  v_kinds  text[];
  v_counts jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_kind is null or not (p_kind = any (array['like', 'dislike', 'heart', 'laugh', 'wow', 'think']::text[])) then
    raise exception 'invalid_reaction' using errcode = '22023';
  end if;
  -- 같은 퐁에 동시에 반응해도 개수가 어긋나지 않게 퐁 행을 잠근다
  select * into n from public.nodes where id = p_node for update;
  if n.id is null or n.type <> 'pong' or n.is_hidden then
    raise exception 'reaction_target_not_found' using errcode = 'P0002';
  end if;
  if not (public.is_room_member(n.room_id) or public.is_room_host(n.room_id)) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if not public.room_is_open(n.room_id) then
    raise exception 'room_closed' using errcode = '42501';
  end if;

  insert into public.node_reactions as r (node_id, user_id, kinds)
  values (p_node, v_uid, array[p_kind])
  on conflict (node_id, user_id) do update
    set kinds = case when p_kind = any (r.kinds) then array_remove(r.kinds, p_kind) else r.kinds || p_kind end,
        updated_at = now()
  returning kinds into v_kinds;

  select coalesce(jsonb_object_agg(k, c), '{}'::jsonb) into v_counts
    from (select unnest(kinds) as k, count(*) as c from public.node_reactions where node_id = p_node group by 1) t;

  perform set_config('ppr.reaction', 'on', true);
  update public.nodes set meta = jsonb_set(meta, '{reactions}', v_counts) where id = p_node;
  perform set_config('ppr.reaction', '', true);

  return jsonb_build_object('mine', to_jsonb(v_kinds), 'reactions', v_counts);
end $$;

-- 이 강의에서 내가 고른 반응 { node_id: [kind, ...] }
create or replace function public.my_reactions(p_room uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(r.node_id, to_jsonb(r.kinds)), '{}'::jsonb)
  from public.node_reactions r
  join public.nodes n on n.id = r.node_id
  where n.room_id = p_room and r.user_id = (select auth.uid()) and cardinality(r.kinds) > 0
$$;

create or replace function public.poll_results(p_node uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  n public.nodes;
  v_counts jsonb;
  v_total int;
begin
  select * into n from public.nodes where id = p_node and type = 'poll';
  if n.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.is_room_host(n.room_id) then
    if not public.is_room_member(n.room_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
    if coalesce(n.meta ->> 'show_results', 'after_close') <> 'live' and coalesce(n.meta ->> 'status', 'ready') <> 'closed' then
      raise exception 'results_hidden' using errcode = '42501';
    end if;
  end if;
  select count(*) into v_total from public.poll_votes where node_id = p_node;
  select coalesce(jsonb_object_agg(opt, cnt), '{}'::jsonb) into v_counts
    from (
      select unnest(option_ids) as opt, count(*) as cnt
      from public.poll_votes where node_id = p_node group by 1
    ) t;
  return jsonb_build_object('total_voters', v_total, 'counts', v_counts);
end $$;

-- 설문 결과: 강사만. 익명 설문이면 응답자 정보를 빼고, 순서를 섞는다.
create or replace function public.survey_results(p_survey uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s public.room_surveys;
begin
  select * into s from public.room_surveys where id = p_survey;
  if s.id is null or not public.is_room_host(s.room_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if s.anonymous then
    return coalesce((
      select jsonb_agg(jsonb_build_object('id', md5(sr.id::text), 'answers', sr.answers,
                                          'submitted_at', date_trunc('hour', sr.submitted_at), 'respondent', null)
                       order by md5(sr.id::text))
      from public.survey_responses sr where sr.room_survey_id = p_survey
    ), '[]'::jsonb);
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', sr.id, 'answers', sr.answers, 'submitted_at', sr.submitted_at,
      'respondent', jsonb_build_object('nickname', m.nickname, 'org', pa.org, 'dept', pa.dept, 'name', pa.name)
    ) order by sr.submitted_at)
    from public.survey_responses sr
    left join public.room_members m on m.room_id = s.room_id and m.user_id = sr.user_id
    left join public.participants pa on pa.room_id = s.room_id and pa.user_id = sr.user_id
    where sr.room_survey_id = p_survey
  ), '[]'::jsonb);
end $$;

-- [지금 파기]: 등록·명단·설문 응답을 앞당겨 지운다.
create or replace function public.purge_pii_now(p_room uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_room_host(p_room) then raise exception 'not_allowed' using errcode = '42501'; end if;
  delete from public.survey_responses where room_id = p_room;
  delete from public.participants where room_id = p_room;
  delete from public.rosters where room_id = p_room;
end $$;

-- 강사 대시보드 목록(호출한 사람의 RLS가 적용된다)
create or replace function public.my_rooms()
returns table (room jsonb, member_count bigint, ping_count bigint, pong_count bigint)
language sql stable security invoker set search_path = '' as $$
  select to_jsonb(r),
         (select count(*) from public.room_members m where m.room_id = r.id),
         (select count(*) from public.nodes n where n.room_id = r.id and n.type in ('ping', 'poll')),
         (select count(*) from public.nodes n where n.room_id = r.id and n.type in ('pong', 'reply') and not n.is_hidden)
  from public.rooms r
  where r.host_id = (select auth.uid())
  order by coalesce(r.started_at, r.created_at) desc
$$;

-- 핑 세트 불러오기
create or replace function public.apply_ping_set(p_room uuid, p_items jsonb)
returns int language plpgsql security invoker set search_path = '' as $$
declare
  item jsonb;
  n int := 0;
begin
  if not public.is_room_host(p_room) then raise exception 'not_allowed' using errcode = '42501'; end if;
  for item in select * from jsonb_array_elements(p_items) loop
    insert into public.nodes (room_id, type, content, attachments, meta)
    values (
      p_room,
      case when item ->> 'type' = 'poll' then 'poll' else 'ping' end,
      coalesce(item ->> 'content', ''),
      coalesce(item -> 'attachments', '[]'::jsonb),
      coalesce(item -> 'meta', '{}'::jsonb)
    );
    n := n + 1;
  end loop;
  return n;
end $$;

-- 일시정지 방지용 가벼운 호출(GitHub Actions)
create or replace function public.keepalive()
returns timestamptz language sql stable as $$ select now() $$;

-- 파기 Edge Function이 쓰는 목록: 오래되고 어디에도 속하지 않은 익명 계정
create or replace function public.stale_anonymous_users(p_limit int default 200)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u
   where u.is_anonymous
     and u.created_at < now() - interval '10 days'
     and not exists (select 1 from public.room_members m where m.user_id = u.id)
     and not exists (select 1 from public.participants p where p.user_id = u.id)
   limit p_limit
$$;

-- 실행 권한 정리
revoke execute on all functions in schema public from public, anon;
grant execute on function public.keepalive() to anon, authenticated;
grant execute on function
  public.try_uuid(text), public.is_anonymous_user(), public.new_reg_token(),
  public.is_room_host(uuid), public.is_room_member(uuid), public.room_is_open(uuid),
  public.poll_is_open(uuid), public.survey_is_open(uuid), public.validate_attachments(jsonb),
  public.can_vote(uuid), public.can_respond(uuid),
  public.start_room(uuid), public.extend_room(uuid, int), public.close_room(uuid),
  public.room_lookup(text), public.join_room(text, text),
  public.registration_lookup(text), public.register_by_token(text, jsonb),
  public.poll_results(uuid), public.survey_results(uuid), public.purge_pii_now(uuid),
  public.my_rooms(), public.apply_ping_set(uuid, jsonb),
  public.toggle_reaction(uuid, text), public.my_reactions(uuid), public.normalize_room_code(text)
  to authenticated;
revoke execute on function public.close_expired_rooms(), public.stale_anonymous_users(int) from authenticated;
grant execute on function public.close_expired_rooms(), public.stale_anonymous_users(int) to service_role;

-- ---------------------------------------------------------------------
-- 6. 실시간(Postgres Changes) — 강의실 단위로 room_id 필터를 건다.
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.rooms, public.nodes, public.room_members, public.room_surveys;

-- ---------------------------------------------------------------------
-- 7. 스토리지: 공개 버킷(추측할 수 없는 경로), 10MB, 허용 형식만
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rooms', 'rooms', true, 10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf', 'text/plain', 'text/csv', 'text/markdown',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/x-hwp', 'application/haansofthwp', 'application/vnd.hancom.hwp', 'application/vnd.hancom.hwpx',
    'application/zip'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy rooms_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'rooms'
    and (
      public.is_room_host(public.try_uuid((storage.foldername(name))[1]))
      or (
        public.is_room_member(public.try_uuid((storage.foldername(name))[1]))
        and public.room_is_open(public.try_uuid((storage.foldername(name))[1]))
      )
    )
  );
