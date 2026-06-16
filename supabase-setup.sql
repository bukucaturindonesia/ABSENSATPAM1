-- ABSENSI GKN MAMUJU
-- Jalankan seluruh file ini di Supabase SQL Editor.
-- Frontend hanya memakai anon public key. Jangan gunakan service_role key di frontend.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tabel utama
-- ---------------------------------------------------------------------------

create table if not exists public.guards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pin text not null,
  bagian text not null default 'Satpam',
  shift text not null default 'Reguler',
  phone text,
  photo_url text,
  bio text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.guards add column if not exists bagian text not null default 'Satpam';
alter table public.guards add column if not exists shift text not null default 'Reguler';
alter table public.guards add column if not exists phone text;
alter table public.guards add column if not exists photo_url text;
alter table public.guards add column if not exists bio text;
alter table public.guards add column if not exists updated_at timestamptz not null default now();
alter table public.guards drop constraint if exists guards_bagian_check;
alter table public.guards add constraint guards_bagian_check
  check (bagian in ('Pramubakti', 'Cleaning Service', 'Satpam', 'Teknisi', 'Driver'));
create unique index if not exists guards_name_lower_unique on public.guards(lower(name));

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  guard_id uuid not null references public.guards(id) on delete cascade,
  guard_name text not null,
  bagian text not null,
  shift text,
  date date not null,
  check_in_time timestamptz,
  check_out_time timestamptz,
  work_duration text,
  status text,
  check_in_latitude numeric,
  check_in_longitude numeric,
  check_out_latitude numeric,
  check_out_longitude numeric,
  check_in_selfie_url text,
  check_out_selfie_url text,
  check_in_note text,
  check_out_note text,
  is_overtime boolean not null default false,
  overtime_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_guard_date_unique unique (guard_id, date)
);

alter table public.attendance add column if not exists bagian text not null default 'Satpam';
alter table public.attendance add column if not exists shift text;
alter table public.attendance add column if not exists check_in_latitude numeric;
alter table public.attendance add column if not exists check_in_longitude numeric;
alter table public.attendance add column if not exists check_out_latitude numeric;
alter table public.attendance add column if not exists check_out_longitude numeric;
alter table public.attendance add column if not exists check_in_selfie_url text;
alter table public.attendance add column if not exists check_out_selfie_url text;
alter table public.attendance add column if not exists check_in_note text;
alter table public.attendance add column if not exists check_out_note text;
alter table public.attendance add column if not exists is_overtime boolean not null default false;
alter table public.attendance add column if not exists overtime_note text;
alter table public.attendance add column if not exists updated_at timestamptz not null default now();
alter table public.attendance drop constraint if exists attendance_status_check;
alter table public.attendance add constraint attendance_status_check
  check (status in ('Hadir', 'Terlambat', 'Pulang Cepat', 'Terlambat dan Pulang Cepat', 'Lembur', 'Izin', 'Sakit', 'Cuti'));
alter table public.attendance drop constraint if exists attendance_bagian_check;
alter table public.attendance add constraint attendance_bagian_check
  check (bagian in ('Pramubakti', 'Cleaning Service', 'Satpam', 'Teknisi', 'Driver'));

create index if not exists attendance_date_idx on public.attendance(date);
create index if not exists attendance_bagian_date_idx on public.attendance(bagian, date);
create index if not exists attendance_guard_idx on public.attendance(guard_id);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  guard_id uuid not null references public.guards(id) on delete cascade,
  guard_name text not null,
  bagian text not null,
  jenis text not null,
  tanggal_mulai date not null,
  tanggal_selesai date not null,
  alasan text not null,
  bukti_url text,
  status text not null default 'pending',
  catatan_admin text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_requests_jenis_check check (jenis in ('izin', 'sakit', 'cuti', 'lembur')),
  constraint leave_requests_status_check check (status in ('pending', 'approved', 'rejected')),
  constraint leave_requests_bagian_check check (bagian in ('Pramubakti', 'Cleaning Service', 'Satpam', 'Teknisi', 'Driver')),
  constraint leave_requests_date_check check (tanggal_selesai >= tanggal_mulai)
);
create index if not exists leave_requests_guard_idx on public.leave_requests(guard_id, created_at desc);
create index if not exists leave_requests_bagian_idx on public.leave_requests(bagian, jenis, status);

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  username text not null,
  password_hash text not null,
  role text not null,
  bagian text not null default 'Semua',
  status text not null default 'aktif',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_users_role_check check (role in ('super_admin', 'admin_umum', 'admin_bagian')),
  constraint admin_users_bagian_check check (bagian in ('Semua', 'Pramubakti', 'Cleaning Service', 'Satpam', 'Teknisi', 'Driver')),
  constraint admin_users_status_check check (status in ('aktif', 'nonaktif')),
  constraint admin_users_role_bagian_check check (
    (role in ('super_admin', 'admin_umum') and bagian = 'Semua')
    or (role = 'admin_bagian' and bagian <> 'Semua')
  )
);
create unique index if not exists admin_users_username_lower_unique on public.admin_users(lower(username));

alter table public.leave_requests drop constraint if exists leave_requests_decided_by_fkey;
alter table public.leave_requests
  add constraint leave_requests_decided_by_fkey
  foreign key (decided_by) references public.admin_users(id) on delete set null;

create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.admin_users(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists admin_sessions_admin_idx on public.admin_sessions(admin_id);
create index if not exists admin_sessions_expiry_idx on public.admin_sessions(expires_at);

create table if not exists public.office_locations (
  id uuid primary key default gen_random_uuid(),
  nama_lokasi text not null,
  latitude numeric not null,
  longitude numeric not null,
  radius_meter integer not null default 150,
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists guards_updated_at on public.guards;
create trigger guards_updated_at before update on public.guards for each row execute function public.set_updated_at();
drop trigger if exists attendance_updated_at on public.attendance;
create trigger attendance_updated_at before update on public.attendance for each row execute function public.set_updated_at();
drop trigger if exists leave_requests_updated_at on public.leave_requests;
create trigger leave_requests_updated_at before update on public.leave_requests for each row execute function public.set_updated_at();
drop trigger if exists admin_users_updated_at on public.admin_users;
create trigger admin_users_updated_at before update on public.admin_users for each row execute function public.set_updated_at();
drop trigger if exists office_locations_updated_at on public.office_locations;
create trigger office_locations_updated_at before update on public.office_locations for each row execute function public.set_updated_at();

create or replace function public.distance_meters(a_lat numeric, a_lng numeric, b_lat numeric, b_lng numeric)
returns numeric language sql immutable as $$
  select round(
    6371000 * 2 * asin(
      sqrt(
        power(sin(radians((b_lat - a_lat) / 2)), 2) +
        cos(radians(a_lat)) * cos(radians(b_lat)) *
        power(sin(radians((b_lng - a_lng) / 2)), 2)
      )
    )
  );
$$;

create or replace function public.get_admin_by_token(p_token text)
returns public.admin_users language sql stable security definer set search_path = public, extensions as $$
  select a
  from public.admin_users a
  join public.admin_sessions s on s.admin_id = a.id
  where s.token = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and s.expires_at > now()
    and a.status = 'aktif'
  limit 1;
$$;

create or replace function public.admin_has_bagian_access(p_admin public.admin_users, p_bagian text)
returns boolean language sql immutable set search_path = public as $$
  select p_admin.role in ('super_admin', 'admin_umum')
    or (p_admin.role = 'admin_bagian' and p_admin.bagian = p_bagian);
$$;

create or replace function public.default_location_warning(p_latitude numeric, p_longitude numeric)
returns text language plpgsql stable set search_path = public as $$
declare
  v_office public.office_locations%rowtype;
  v_distance numeric;
begin
  select * into v_office from public.office_locations where is_default = true order by created_at desc limit 1;
  if not found then return ''; end if;
  v_distance := public.distance_meters(v_office.latitude, v_office.longitude, p_latitude, p_longitude);
  if v_distance > v_office.radius_meter then
    return format('Peringatan: di luar radius %s m. Jarak sekitar %s m.', v_office.radius_meter, v_distance);
  end if;
  return '';
end;
$$;

-- ---------------------------------------------------------------------------
-- Login pegawai dan proses pegawai
-- ---------------------------------------------------------------------------

drop function if exists public.login_guard(text, text);
create or replace function public.login_guard(p_name text, p_pin text)
returns table (
  id uuid, name text, bagian text, shift text, phone text,
  photo_url text, bio text, is_active boolean, created_at timestamptz, updated_at timestamptz
) language sql security definer set search_path = public as $$
  select g.id, g.name, g.bagian, g.shift, g.phone, g.photo_url, g.bio, g.is_active, g.created_at, g.updated_at
  from public.guards g
  where lower(g.name) = lower(trim(p_name))
    and g.pin = p_pin
    and g.is_active = true
  limit 1;
$$;

create or replace function public.employee_update_profile(
  p_guard_id uuid, p_pin text, p_photo_url text, p_bio text, p_new_pin text
) returns table (
  id uuid, name text, bagian text, shift text, phone text,
  photo_url text, bio text, is_active boolean, created_at timestamptz, updated_at timestamptz
) language plpgsql security definer set search_path = public as $$
begin
  update public.guards g
  set photo_url = coalesce(nullif(p_photo_url, ''), g.photo_url),
      bio = coalesce(p_bio, ''),
      pin = case when nullif(p_new_pin, '') is null then g.pin else p_new_pin end
  where g.id = p_guard_id and g.pin = p_pin and g.is_active = true;

  if not found then raise exception 'Akun pegawai tidak valid.'; end if;

  return query
  select g.id, g.name, g.bagian, g.shift, g.phone, g.photo_url, g.bio, g.is_active, g.created_at, g.updated_at
  from public.guards g where g.id = p_guard_id;
end;
$$;

create or replace function public.get_guard_daily_attendance(p_guard_id uuid, p_pin text, p_date date)
returns setof public.attendance language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.guards where id = p_guard_id and pin = p_pin and is_active = true) then
    raise exception 'Akun pegawai tidak valid.';
  end if;
  return query select * from public.attendance where guard_id = p_guard_id and date = p_date limit 1;
end;
$$;

create or replace function public.employee_list_attendance(p_guard_id uuid, p_pin text)
returns setof public.attendance language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.guards where id = p_guard_id and pin = p_pin and is_active = true) then
    raise exception 'Akun pegawai tidak valid.';
  end if;
  return query select * from public.attendance where guard_id = p_guard_id order by date desc, created_at desc limit 90;
end;
$$;

create or replace function public.guard_check_in(
  p_guard_id uuid, p_pin text, p_date date, p_check_in_time timestamptz,
  p_latitude numeric, p_longitude numeric, p_selfie_url text, p_note text default ''
) returns setof public.attendance language plpgsql security definer set search_path = public as $$
declare
  v_guard public.guards%rowtype;
  v_today date := (now() at time zone 'Asia/Makassar')::date;
  v_now timestamptz := now();
  v_status text;
  v_note text;
  v_id uuid;
begin
  select * into v_guard from public.guards where id = p_guard_id and pin = p_pin and is_active = true;
  if not found then raise exception 'Akun pegawai tidak valid.'; end if;
  if p_date <> v_today then raise exception 'Tanggal absensi tidak sesuai tanggal server.'; end if;
  if nullif(p_selfie_url, '') is null then raise exception 'Selfie masuk wajib diisi.'; end if;
  if exists (select 1 from public.attendance where guard_id = p_guard_id and date = v_today) then
    raise exception 'Anda sudah absen masuk hari ini.';
  end if;

  v_status := case when (v_now at time zone 'Asia/Makassar')::time > time '07:35' then 'Terlambat' else 'Hadir' end;
  v_note := concat_ws(' | ', nullif(trim(p_note), ''), nullif(public.default_location_warning(p_latitude, p_longitude), ''));

  insert into public.attendance(
    guard_id, guard_name, bagian, shift, date, check_in_time, status,
    check_in_latitude, check_in_longitude, check_in_selfie_url, check_in_note
  ) values (
    v_guard.id, v_guard.name, v_guard.bagian, v_guard.shift, v_today, v_now, v_status,
    p_latitude, p_longitude, p_selfie_url, v_note
  ) returning id into v_id;

  return query select * from public.attendance where id = v_id;
end;
$$;

create or replace function public.guard_check_out(
  p_guard_id uuid, p_pin text, p_date date, p_check_out_time timestamptz,
  p_latitude numeric, p_longitude numeric, p_selfie_url text, p_note text default '',
  p_is_overtime boolean default false, p_overtime_note text default ''
) returns setof public.attendance language plpgsql security definer set search_path = public as $$
declare
  v_record public.attendance%rowtype;
  v_today date := (now() at time zone 'Asia/Makassar')::date;
  v_now timestamptz := now();
  v_minutes integer;
  v_status text;
  v_early boolean;
  v_note text;
begin
  if not exists (select 1 from public.guards where id = p_guard_id and pin = p_pin and is_active = true) then
    raise exception 'Akun pegawai tidak valid.';
  end if;
  if p_date <> v_today then raise exception 'Tanggal absensi tidak sesuai tanggal server.'; end if;
  if nullif(p_selfie_url, '') is null then raise exception 'Selfie pulang wajib diisi.'; end if;

  select * into v_record from public.attendance where guard_id = p_guard_id and date = v_today for update;
  if not found then raise exception 'Anda belum absen masuk hari ini.'; end if;
  if v_record.check_out_time is not null then raise exception 'Anda sudah absen pulang hari ini.'; end if;

  v_minutes := greatest(0, floor(extract(epoch from (v_now - v_record.check_in_time)) / 60)::integer);
  v_early := (v_now at time zone 'Asia/Makassar')::time < time '17:00';
  v_status := case
    when p_is_overtime then 'Lembur'
    when v_record.status = 'Terlambat' and v_early then 'Terlambat dan Pulang Cepat'
    when v_early then 'Pulang Cepat'
    else v_record.status
  end;
  v_note := concat_ws(' | ', nullif(trim(p_note), ''), nullif(public.default_location_warning(p_latitude, p_longitude), ''));

  update public.attendance
  set check_out_time = v_now,
      work_duration = format('%s jam %s menit', v_minutes / 60, mod(v_minutes, 60)),
      status = v_status,
      check_out_latitude = p_latitude,
      check_out_longitude = p_longitude,
      check_out_selfie_url = p_selfie_url,
      check_out_note = v_note,
      is_overtime = p_is_overtime,
      overtime_note = nullif(trim(p_overtime_note), '')
  where id = v_record.id;

  return query select * from public.attendance where id = v_record.id;
end;
$$;

create or replace function public.employee_submit_request(
  p_guard_id uuid, p_pin text, p_jenis text, p_tanggal_mulai date,
  p_tanggal_selesai date, p_alasan text, p_bukti_url text default ''
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_guard public.guards%rowtype;
  v_id uuid;
begin
  select * into v_guard from public.guards where id = p_guard_id and pin = p_pin and is_active = true;
  if not found then raise exception 'Akun pegawai tidak valid.'; end if;
  if p_jenis not in ('izin', 'sakit', 'cuti', 'lembur') then raise exception 'Jenis pengajuan tidak valid.'; end if;
  if p_tanggal_selesai < p_tanggal_mulai then raise exception 'Tanggal selesai tidak boleh sebelum tanggal mulai.'; end if;
  if length(trim(coalesce(p_alasan, ''))) < 5 then raise exception 'Alasan minimal 5 karakter.'; end if;

  insert into public.leave_requests(guard_id, guard_name, bagian, jenis, tanggal_mulai, tanggal_selesai, alasan, bukti_url)
  values (v_guard.id, v_guard.name, v_guard.bagian, p_jenis, p_tanggal_mulai, p_tanggal_selesai, trim(p_alasan), nullif(p_bukti_url, ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.employee_list_requests(p_guard_id uuid, p_pin text)
returns table (
  id uuid, jenis text, tanggal_mulai date, tanggal_selesai date, alasan text,
  bukti_url text, status text, catatan_admin text, created_at timestamptz, updated_at timestamptz
) language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.guards where id = p_guard_id and pin = p_pin and is_active = true) then
    raise exception 'Akun pegawai tidak valid.';
  end if;
  return query
  select r.id, r.jenis, r.tanggal_mulai, r.tanggal_selesai, r.alasan, r.bukti_url, r.status, r.catatan_admin, r.created_at, r.updated_at
  from public.leave_requests r
  where r.guard_id = p_guard_id
  order by r.created_at desc;
end;
$$;

create or replace function public.get_office_location()
returns setof public.office_locations language sql stable security definer set search_path = public as $$
  select * from public.office_locations where is_default = true order by updated_at desc limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------

create or replace function public.admin_login(p_username text, p_password text)
returns table (
  session_token text, admin_id uuid, nama text, username text, role text, bagian text, status text, expires_at timestamptz
) language plpgsql security definer set search_path = public, extensions as $$
declare
  v_admin public.admin_users%rowtype;
  v_token text;
  v_expires timestamptz := now() + interval '8 hours';
begin
  if nullif(trim(p_username), '') is null or nullif(p_password, '') is null then
    raise exception 'Username dan password/PIN wajib diisi.';
  end if;
  select * into v_admin from public.admin_users where lower(username) = lower(trim(p_username)) limit 1;
  if not found or v_admin.password_hash <> crypt(p_password, v_admin.password_hash) then
    raise exception 'Username atau password/PIN admin tidak sesuai.';
  end if;
  if v_admin.status <> 'aktif' then raise exception 'Akun admin sedang nonaktif.'; end if;

  delete from public.admin_sessions where expires_at <= now();
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.admin_sessions(admin_id, token, expires_at)
  values (v_admin.id, encode(digest(v_token, 'sha256'), 'hex'), v_expires);

  return query select v_token, v_admin.id, v_admin.nama, v_admin.username, v_admin.role, v_admin.bagian, v_admin.status, v_expires;
end;
$$;

create or replace function public.admin_get_profile(p_token text)
returns table (
  id uuid, nama text, username text, role text, bagian text, status text, expires_at timestamptz
) language plpgsql security definer set search_path = public, extensions as $$
declare
  v_admin public.admin_users%rowtype;
  v_exp timestamptz;
begin
  v_admin := public.get_admin_by_token(p_token);
  if v_admin.id is null then raise exception 'Sesi admin tidak valid atau sudah berakhir.'; end if;
  select expires_at into v_exp from public.admin_sessions where admin_id = v_admin.id and token = encode(digest(p_token, 'sha256'), 'hex') limit 1;
  return query select v_admin.id, v_admin.nama, v_admin.username, v_admin.role, v_admin.bagian, v_admin.status, v_exp;
end;
$$;

create or replace function public.admin_logout(p_token text)
returns void language sql security definer set search_path = public, extensions as $$
  delete from public.admin_sessions where token = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

create or replace function public.admin_list_employees(p_token text)
returns table (
  id uuid, name text, bagian text, shift text, phone text, photo_url text, bio text, is_active boolean, created_at timestamptz, updated_at timestamptz
) language plpgsql security definer set search_path = public as $$
declare v_admin public.admin_users%rowtype;
begin
  v_admin := public.get_admin_by_token(p_token);
  if v_admin.id is null then raise exception 'Anda tidak memiliki akses'; end if;
  return query
  select g.id, g.name, g.bagian, g.shift, g.phone, g.photo_url, g.bio, g.is_active, g.created_at, g.updated_at
  from public.guards g
  where public.admin_has_bagian_access(v_admin, g.bagian)
  order by g.bagian, g.name;
end;
$$;

create or replace function public.admin_save_employee(
  p_token text, p_id uuid, p_name text, p_pin text, p_bagian text, p_shift text,
  p_phone text, p_photo_url text, p_bio text, p_is_active boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_admin public.admin_users%rowtype;
  v_id uuid;
begin
  v_admin := public.get_admin_by_token(p_token);
  if v_admin.id is null or v_admin.role <> 'super_admin' then raise exception 'Anda tidak memiliki akses'; end if;
  if p_bagian not in ('Pramubakti', 'Cleaning Service', 'Satpam', 'Teknisi', 'Driver') then raise exception 'Bagian tidak valid.'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Nama pegawai wajib diisi.'; end if;

  if p_id is null then
    insert into public.guards(name, pin, bagian, shift, phone, photo_url, bio, is_active)
    values (trim(p_name), coalesce(nullif(p_pin, ''), '1234'), p_bagian, coalesce(nullif(p_shift, ''), 'Reguler'), nullif(p_phone, ''), nullif(p_photo_url, ''), nullif(p_bio, ''), p_is_active)
    returning id into v_id;
  else
    update public.guards g
    set name = trim(p_name),
        pin = case when nullif(p_pin, '') is null then g.pin else p_pin end,
        bagian = p_bagian,
        shift = coalesce(nullif(p_shift, ''), 'Reguler'),
        phone = nullif(p_phone, ''),
        photo_url = coalesce(nullif(p_photo_url, ''), g.photo_url),
        bio = nullif(p_bio, ''),
        is_active = p_is_active
    where g.id = p_id
    returning g.id into v_id;
    if v_id is null then raise exception 'Data pegawai tidak ditemukan.'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_delete_employee(p_token text, p_guard_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_admin public.admin_users%rowtype;
begin
  v_admin := public.get_admin_by_token(p_token);
  if v_admin.id is null or v_admin.role <> 'super_admin' then raise exception 'Anda tidak memiliki akses'; end if;
  delete from public.guards where id = p_guard_id;
end;
$$;

create or replace function public.admin_list_attendance(p_token text, p_start date, p_end date)
returns setof public.attendance language plpgsql security definer set search_path = public as $$
declare v_admin public.admin_users%rowtype;
begin
  v_admin := public.get_admin_by_token(p_token);
  if v_admin.id is null then raise exception 'Anda tidak memiliki akses'; end if;
  return query
  select a.* from public.attendance a
  where a.date between p_start and p_end
    and public.admin_has_bagian_access(v_admin, a.bagian)
  order by a.date desc, a.check_in_time desc nulls last;
end;
$$;

create or replace function public.admin_list_requests(p_token text, p_jenis text default null)
returns setof public.leave_requests language plpgsql security definer set search_path = public as $$
declare v_admin public.admin_users%rowtype;
begin
  v_admin := public.get_admin_by_token(p_token);
  if v_admin.id is null then raise exception 'Anda tidak memiliki akses'; end if;
  if p_jenis is not null and p_jenis not in ('izin', 'sakit', 'cuti', 'lembur') then raise exception 'Jenis pengajuan tidak valid.'; end if;
  return query
  select r.* from public.leave_requests r
  where (p_jenis is null or r.jenis = p_jenis)
    and public.admin_has_bagian_access(v_admin, r.bagian)
  order by case when r.status = 'pending' then 0 else 1 end, r.created_at desc;
end;
$$;

create or replace function public.admin_decide_request(p_token text, p_request_id uuid, p_status text, p_catatan text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_admin public.admin_users%rowtype;
  v_request public.leave_requests%rowtype;
begin
  v_admin := public.get_admin_by_token(p_token);
  if v_admin.id is null then raise exception 'Anda tidak memiliki akses'; end if;
  if p_status not in ('approved', 'rejected') then raise exception 'Status keputusan tidak valid.'; end if;
  select * into v_request from public.leave_requests where id = p_request_id;
  if not found or not public.admin_has_bagian_access(v_admin, v_request.bagian) then raise exception 'Anda tidak memiliki akses'; end if;
  update public.leave_requests
  set status = p_status, catatan_admin = nullif(trim(p_catatan), ''), decided_by = v_admin.id, decided_at = now()
  where id = p_request_id;
end;
$$;

create or replace function public.admin_list_users(p_token text)
returns table (
  id uuid, nama text, username text, role text, bagian text, status text, created_at timestamptz, updated_at timestamptz
) language plpgsql security definer set search_path = public as $$
declare v_admin public.admin_users%rowtype;
begin
  v_admin := public.get_admin_by_token(p_token);
  if v_admin.id is null or v_admin.role <> 'super_admin' then raise exception 'Anda tidak memiliki akses'; end if;
  return query select a.id, a.nama, a.username, a.role, a.bagian, a.status, a.created_at, a.updated_at from public.admin_users a order by a.role, a.nama;
end;
$$;

create or replace function public.admin_save_user(
  p_token text, p_id uuid, p_nama text, p_username text, p_password text,
  p_role text, p_bagian text, p_status text
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_admin public.admin_users%rowtype;
  v_target public.admin_users%rowtype;
  v_id uuid;
  v_bagian text;
  v_super_count integer;
begin
  v_admin := public.get_admin_by_token(p_token);
  if v_admin.id is null or v_admin.role <> 'super_admin' then raise exception 'Anda tidak memiliki akses'; end if;
  if p_role not in ('super_admin', 'admin_umum', 'admin_bagian') then raise exception 'Role admin tidak valid.'; end if;
  if p_status not in ('aktif', 'nonaktif') then raise exception 'Status admin tidak valid.'; end if;
  if nullif(trim(p_nama), '') is null or nullif(trim(p_username), '') is null then raise exception 'Nama dan username wajib diisi.'; end if;
  if nullif(p_password, '') is not null and length(p_password) < 6 then raise exception 'Password/PIN admin minimal 6 karakter.'; end if;

  v_bagian := case when p_role = 'admin_bagian' then p_bagian else 'Semua' end;
  if v_bagian not in ('Semua', 'Pramubakti', 'Cleaning Service', 'Satpam', 'Teknisi', 'Driver') or (p_role = 'admin_bagian' and v_bagian = 'Semua') then
    raise exception 'Bagian admin tidak valid.';
  end if;

  if p_id is null then
    if length(coalesce(p_password, '')) < 6 then raise exception 'Password/PIN admin minimal 6 karakter.'; end if;
    insert into public.admin_users(nama, username, password_hash, role, bagian, status)
    values (trim(p_nama), lower(trim(p_username)), crypt(p_password, gen_salt('bf', 10)), p_role, v_bagian, p_status)
    returning id into v_id;
  else
    select * into v_target from public.admin_users where id = p_id;
    if not found then raise exception 'Data admin tidak ditemukan.'; end if;
    if p_id = v_admin.id and p_status = 'nonaktif' then raise exception 'Anda tidak dapat menonaktifkan akun yang sedang digunakan.'; end if;
    if v_target.role = 'super_admin' and v_target.status = 'aktif' and (p_role <> 'super_admin' or p_status <> 'aktif') then
      select count(*) into v_super_count from public.admin_users where role = 'super_admin' and status = 'aktif';
      if v_super_count <= 1 then raise exception 'Minimal satu Super Admin aktif harus dipertahankan.'; end if;
    end if;
    update public.admin_users a
    set nama = trim(p_nama),
        username = lower(trim(p_username)),
        password_hash = case when nullif(p_password, '') is null then a.password_hash else crypt(p_password, gen_salt('bf', 10)) end,
        role = p_role,
        bagian = v_bagian,
        status = p_status
    where a.id = p_id
    returning a.id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_delete_user(p_token text, p_admin_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_admin public.admin_users%rowtype;
  v_target public.admin_users%rowtype;
  v_super_count integer;
begin
  v_admin := public.get_admin_by_token(p_token);
  if v_admin.id is null or v_admin.role <> 'super_admin' then raise exception 'Anda tidak memiliki akses'; end if;
  if p_admin_id = v_admin.id then raise exception 'Anda tidak dapat menghapus akun yang sedang digunakan.'; end if;
  select * into v_target from public.admin_users where id = p_admin_id;
  if not found then raise exception 'Data admin tidak ditemukan.'; end if;
  if v_target.role = 'super_admin' and v_target.status = 'aktif' then
    select count(*) into v_super_count from public.admin_users where role = 'super_admin' and status = 'aktif';
    if v_super_count <= 1 then raise exception 'Minimal satu Super Admin aktif harus dipertahankan.'; end if;
  end if;
  delete from public.admin_users where id = p_admin_id;
end;
$$;

create or replace function public.admin_get_office_location(p_token text)
returns setof public.office_locations language plpgsql security definer set search_path = public as $$
declare v_admin public.admin_users%rowtype;
begin
  v_admin := public.get_admin_by_token(p_token);
  if v_admin.id is null then raise exception 'Anda tidak memiliki akses'; end if;
  return query select * from public.office_locations where is_default = true order by updated_at desc limit 1;
end;
$$;

create or replace function public.admin_save_office_location(p_token text, p_nama_lokasi text, p_latitude numeric, p_longitude numeric, p_radius_meter integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_admin public.admin_users%rowtype;
begin
  v_admin := public.get_admin_by_token(p_token);
  if v_admin.id is null or v_admin.role <> 'super_admin' then raise exception 'Anda tidak memiliki akses'; end if;
  update public.office_locations set is_default = false where is_default = true;
  insert into public.office_locations(nama_lokasi, latitude, longitude, radius_meter, is_default)
  values (trim(p_nama_lokasi), p_latitude, p_longitude, p_radius_meter, true);
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS, grants, storage
-- ---------------------------------------------------------------------------

alter table public.guards enable row level security;
alter table public.attendance enable row level security;
alter table public.leave_requests enable row level security;
alter table public.admin_users enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.office_locations enable row level security;

drop policy if exists "admin can read guards" on public.guards;
drop policy if exists "admin can insert guards" on public.guards;
drop policy if exists "admin can update guards" on public.guards;
drop policy if exists "admin can read attendance" on public.attendance;
drop policy if exists "admin can update attendance" on public.attendance;

revoke all on public.guards from anon, authenticated;
revoke all on public.attendance from anon, authenticated;
revoke all on public.leave_requests from anon, authenticated;
revoke all on public.admin_users from anon, authenticated;
revoke all on public.admin_sessions from anon, authenticated;
revoke all on public.office_locations from anon, authenticated;

grant execute on function public.login_guard(text, text) to anon, authenticated;
grant execute on function public.employee_update_profile(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.get_guard_daily_attendance(uuid, text, date) to anon, authenticated;
grant execute on function public.employee_list_attendance(uuid, text) to anon, authenticated;
grant execute on function public.guard_check_in(uuid, text, date, timestamptz, numeric, numeric, text, text) to anon, authenticated;
grant execute on function public.guard_check_out(uuid, text, date, timestamptz, numeric, numeric, text, text, boolean, text) to anon, authenticated;
grant execute on function public.employee_submit_request(uuid, text, text, date, date, text, text) to anon, authenticated;
grant execute on function public.employee_list_requests(uuid, text) to anon, authenticated;
grant execute on function public.get_office_location() to anon, authenticated;
grant execute on function public.admin_login(text, text) to anon, authenticated;
grant execute on function public.admin_get_profile(text) to anon, authenticated;
grant execute on function public.admin_logout(text) to anon, authenticated;
grant execute on function public.admin_list_users(text) to anon, authenticated;
grant execute on function public.admin_save_user(text, uuid, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_delete_user(text, uuid) to anon, authenticated;
grant execute on function public.admin_list_employees(text) to anon, authenticated;
grant execute on function public.admin_save_employee(text, uuid, text, text, text, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.admin_delete_employee(text, uuid) to anon, authenticated;
grant execute on function public.admin_list_attendance(text, date, date) to anon, authenticated;
grant execute on function public.admin_list_requests(text, text) to anon, authenticated;
grant execute on function public.admin_decide_request(text, uuid, text, text) to anon, authenticated;
grant execute on function public.admin_get_office_location(text) to anon, authenticated;
grant execute on function public.admin_save_office_location(text, text, numeric, numeric, integer) to anon, authenticated;

insert into storage.buckets(id, name, public) values
  ('attendance-selfies', 'attendance-selfies', true),
  ('profile-photos', 'profile-photos', true),
  ('request-proofs', 'request-proofs', true)
on conflict (id) do update set public = true;

drop policy if exists "public can view gkn files" on storage.objects;
create policy "public can view gkn files" on storage.objects for select to public
using (bucket_id in ('attendance-selfies', 'profile-photos', 'request-proofs'));
drop policy if exists "anon can upload gkn files" on storage.objects;
create policy "anon can upload gkn files" on storage.objects for insert to anon, authenticated
with check (bucket_id in ('attendance-selfies', 'profile-photos', 'request-proofs'));

-- ---------------------------------------------------------------------------
-- Data awal
-- ---------------------------------------------------------------------------

insert into public.office_locations(nama_lokasi, latitude, longitude, radius_meter, is_default)
select 'GKN Mamuju', -2.6779, 118.8865, 150, true
where not exists (select 1 from public.office_locations where is_default = true);

insert into public.guards(name, pin, bagian, shift, phone, bio, is_active)
values
  ('Abdul Haris', '1234', 'Satpam', 'Pagi', '', '', true),
  ('Mustar / Gino', '1234', 'Satpam', 'Pagi', '', '', true),
  ('Asriyadi', '1234', 'Satpam', 'Pagi', '', '', true),
  ('Jono M. Pandu', '1234', 'Satpam', 'Pagi', '', '', true),
  ('Muh. Nasri', '1234', 'Satpam', 'Pagi', '', '', true),
  ('Padli', '1234', 'Satpam', 'Pagi', '', '', true),
  ('GAT', '1234', 'Satpam', 'Pagi', '', '', true),
  ('Firnas', '1234', 'Satpam', 'Pagi', '', '', true),
  ('Ismail', '1234', 'Satpam', 'Pagi', '', 'Koordinator Umum Satpam', true),
  ('Sabri', '1234', 'Satpam', 'Pagi', '', '', true),
  ('Darmawan', '1234', 'Satpam', 'Pagi', '', '', true),
  ('Ibrahim', '1234', 'Satpam', 'Pagi', '', '', true),
  ('Irwan', '1234', 'Satpam', 'Pagi', '', '', true),
  ('Muh. Quraish A', '1234', 'Satpam', 'Pagi', '', '', true),
  ('Syamsu Alim', '1234', 'Satpam', 'Pagi', '', '', true),
  ('Kaharuddin', '1234', 'Satpam', 'Pagi', '', '', true),
  ('Rusdin', '1234', 'Satpam', 'Pagi', '', '', true),
  ('Anwar Wahyu', '1234', 'Satpam', 'Pagi', '', '', true),
  ('Sucipto', '1234', 'Satpam', 'Pagi', '', '', true),
  ('Sania', '1234', 'Satpam', 'Pagi', '', '', true),
  ('Gusti Pidun Paonganan', '1234', 'Satpam', 'Pagi', '', '', true),
  ('Yusril', '1234', 'Satpam', 'Pagi', '', '', true),
  ('Irsal Priyadi', '1234', 'Satpam', 'Pagi', '', '', true),
  ('Herman Habe', '1234', 'Satpam', 'Pagi', '', '', true),
  ('Ikbal', '1234', 'Satpam', 'Pagi', '', '', true),
  ('Irfandi', '1234', 'Satpam', 'Pagi', '', '', true),
  ('Kisman', '1234', 'Satpam', 'Pagi', '', '', true),
  ('M. Darwis', '1234', 'Satpam', 'Pagi', '', '', true),
  ('Fahmi Salam', '1234', 'Pramubakti', 'Reguler', '', '', true),
  ('Wenda Monika', '1234', 'Pramubakti', 'Reguler', '', '', true),
  ('Saiful Anwar', '1234', 'Pramubakti', 'Reguler', '', '', true),
  ('Muh. Arsal', '1234', 'Driver', 'Reguler', '', '', true),
  ('Muh. Aldi', '1234', 'Teknisi', 'Reguler', '', '', true),
  ('Aswadi', '1234', 'Teknisi', 'Reguler', '', 'Koordinator Umum Non Satpam', true)
on conflict do nothing;

insert into public.admin_users(nama, username, password_hash, role, bagian, status)
values
  ('Super Admin', 'superadmin', crypt('GKN-Super-2026!', gen_salt('bf', 10)), 'super_admin', 'Semua', 'aktif'),
  ('Admin Umum', 'adminumum', crypt('GKN-Umum-2026!', gen_salt('bf', 10)), 'admin_umum', 'Semua', 'aktif'),
  ('Admin Satpam', 'adminsatpam', crypt('Satpam-2026!', gen_salt('bf', 10)), 'admin_bagian', 'Satpam', 'aktif'),
  ('Admin Teknisi', 'adminteknisi', crypt('Teknisi-2026!', gen_salt('bf', 10)), 'admin_bagian', 'Teknisi', 'aktif'),
  ('Admin Pramubakti', 'adminpramubakti', crypt('Pramubakti-2026!', gen_salt('bf', 10)), 'admin_bagian', 'Pramubakti', 'aktif'),
  ('Admin Cleaning Service', 'admincleaning', crypt('Cleaning-2026!', gen_salt('bf', 10)), 'admin_bagian', 'Cleaning Service', 'aktif'),
  ('Admin Driver', 'admindriver', crypt('Driver-2026!', gen_salt('bf', 10)), 'admin_bagian', 'Driver', 'aktif')
on conflict do nothing;
