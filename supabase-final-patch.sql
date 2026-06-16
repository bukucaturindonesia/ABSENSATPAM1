-- ABSENSI GKN MAMUJU - FINAL PATCH
-- Jalankan file ini di Supabase SQL Editor setelah supabase-setup.sql.
-- Patch ini tidak menghapus data pegawai/admin lama.
-- Frontend tetap memakai anon public key dan akses database tetap lewat RPC.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tabel tambahan
-- ---------------------------------------------------------------------------

create table if not exists public.work_schedules (
  id uuid primary key default gen_random_uuid(),
  shift_name text not null unique,
  check_in_time time not null,
  check_out_time time not null,
  late_tolerance_minutes integer not null default 0,
  early_checkout_tolerance_minutes integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_schedules_shift_check check (shift_name in ('Reguler', 'Pagi', 'Siang', 'Malam'))
);

create table if not exists public.overtime_attendance (
  id uuid primary key default gen_random_uuid(),
  guard_id uuid not null references public.guards(id) on delete cascade,
  guard_name text not null,
  bagian text not null,
  date date not null,
  request_id uuid references public.leave_requests(id) on delete set null,
  overtime_start_time timestamptz,
  overtime_end_time timestamptz,
  overtime_duration text,
  start_latitude numeric,
  start_longitude numeric,
  end_latitude numeric,
  end_longitude numeric,
  start_selfie_url text,
  end_selfie_url text,
  note text,
  status text not null default 'berjalan',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint overtime_attendance_status_check check (status in ('berjalan', 'selesai')),
  constraint overtime_attendance_bagian_check check (bagian in ('Pramubakti', 'Cleaning Service', 'Satpam', 'Teknisi', 'Driver'))
);
create index if not exists overtime_attendance_guard_date_idx on public.overtime_attendance(guard_id, date desc);
create index if not exists overtime_attendance_bagian_date_idx on public.overtime_attendance(bagian, date desc);

create table if not exists public.request_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.leave_requests(id) on delete cascade,
  admin_id uuid references public.admin_users(id) on delete set null,
  old_status text,
  new_status text not null,
  note text,
  created_at timestamptz not null default now(),
  constraint request_logs_status_check check (new_status in ('pending', 'approved', 'rejected'))
);
create index if not exists request_logs_request_idx on public.request_logs(request_id, created_at desc);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  target_bagian text not null default 'Semua',
  priority text not null default 'normal',
  start_date date not null,
  end_date date not null,
  is_active boolean not null default true,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_target_check check (target_bagian in ('Semua', 'Pramubakti', 'Cleaning Service', 'Satpam', 'Teknisi', 'Driver')),
  constraint announcements_priority_check check (priority in ('normal', 'penting', 'darurat')),
  constraint announcements_date_check check (end_date >= start_date)
);
create index if not exists announcements_active_idx on public.announcements(is_active, start_date, end_date);

create table if not exists public.announcement_reads (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  guard_id uuid not null references public.guards(id) on delete cascade,
  read_at timestamptz not null default now(),
  constraint announcement_reads_unique unique (announcement_id, guard_id)
);

alter table public.guards drop constraint if exists guards_shift_check;
alter table public.guards add constraint guards_shift_check
  check (shift in ('Reguler', 'Pagi', 'Siang', 'Malam'));

insert into public.work_schedules(shift_name, check_in_time, check_out_time, late_tolerance_minutes, early_checkout_tolerance_minutes, is_active)
values
  ('Reguler', time '07:35', time '17:00', 0, 0, true),
  ('Pagi', time '07:00', time '15:00', 0, 0, true),
  ('Siang', time '15:00', time '23:00', 0, 0, true),
  ('Malam', time '23:00', time '07:00', 0, 0, true)
on conflict (shift_name) do nothing;

update public.office_locations
set is_default = false
where is_default = true;

insert into public.office_locations(nama_lokasi, latitude, longitude, radius_meter, is_default)
values ('Gedung Keuangan Negara Mamuju', -2.6890517, 118.87131, 50, true);

drop trigger if exists work_schedules_updated_at on public.work_schedules;
create trigger work_schedules_updated_at before update on public.work_schedules for each row execute function public.set_updated_at();
drop trigger if exists overtime_attendance_updated_at on public.overtime_attendance;
create trigger overtime_attendance_updated_at before update on public.overtime_attendance for each row execute function public.set_updated_at();
drop trigger if exists announcements_updated_at on public.announcements;
create trigger announcements_updated_at before update on public.announcements for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helper shift
-- ---------------------------------------------------------------------------

create or replace function public.get_work_schedule_by_shift(p_shift text)
returns setof public.work_schedules language sql stable security definer set search_path = public as $$
  select *
  from public.work_schedules
  where shift_name = coalesce(nullif(p_shift, ''), 'Reguler') and is_active = true
  limit 1;
$$;

create or replace function public.shift_minutes(p_time time)
returns integer language sql immutable as $$
  select extract(hour from p_time)::integer * 60 + extract(minute from p_time)::integer;
$$;

-- ---------------------------------------------------------------------------
-- Revisi absensi masuk/pulang agar membaca jadwal shift
-- ---------------------------------------------------------------------------

create or replace function public.guard_check_in(
  p_guard_id uuid, p_pin text, p_date date, p_check_in_time timestamptz,
  p_latitude numeric, p_longitude numeric, p_selfie_url text, p_note text default ''
) returns setof public.attendance language plpgsql security definer set search_path = public as $$
declare
  v_guard public.guards%rowtype;
  v_schedule public.work_schedules%rowtype;
  v_today date := (now() at time zone 'Asia/Makassar')::date;
  v_now timestamptz := now();
  v_local_minutes integer;
  v_limit_minutes integer;
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

  select * into v_schedule from public.work_schedules where shift_name = v_guard.shift and is_active = true limit 1;
  if not found then
    select * into v_schedule from public.work_schedules where shift_name = 'Reguler' limit 1;
  end if;

  v_local_minutes := extract(hour from (v_now at time zone 'Asia/Makassar'))::integer * 60
    + extract(minute from (v_now at time zone 'Asia/Makassar'))::integer;
  v_limit_minutes := public.shift_minutes(v_schedule.check_in_time) + coalesce(v_schedule.late_tolerance_minutes, 0);
  v_status := case when v_local_minutes > v_limit_minutes then 'Terlambat' else 'Hadir' end;
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
  v_guard public.guards%rowtype;
  v_schedule public.work_schedules%rowtype;
  v_today date := (now() at time zone 'Asia/Makassar')::date;
  v_now timestamptz := now();
  v_minutes integer;
  v_local_minutes integer;
  v_checkout_minutes integer;
  v_checkin_minutes integer;
  v_early_limit integer;
  v_status text;
  v_early boolean;
  v_note text;
begin
  select * into v_guard from public.guards where id = p_guard_id and pin = p_pin and is_active = true;
  if not found then raise exception 'Akun pegawai tidak valid.'; end if;
  if p_date <> v_today then raise exception 'Tanggal absensi tidak sesuai tanggal server.'; end if;
  if nullif(p_selfie_url, '') is null then raise exception 'Selfie pulang wajib diisi.'; end if;

  select * into v_record from public.attendance where guard_id = p_guard_id and date = v_today for update;
  if not found then raise exception 'Anda belum absen masuk hari ini.'; end if;
  if v_record.check_out_time is not null then raise exception 'Anda sudah absen pulang hari ini.'; end if;

  select * into v_schedule from public.work_schedules where shift_name = v_guard.shift and is_active = true limit 1;
  if not found then
    select * into v_schedule from public.work_schedules where shift_name = 'Reguler' limit 1;
  end if;

  v_minutes := greatest(0, floor(extract(epoch from (v_now - v_record.check_in_time)) / 60)::integer);
  v_local_minutes := extract(hour from (v_now at time zone 'Asia/Makassar'))::integer * 60
    + extract(minute from (v_now at time zone 'Asia/Makassar'))::integer;
  v_checkin_minutes := public.shift_minutes(v_schedule.check_in_time);
  v_checkout_minutes := public.shift_minutes(v_schedule.check_out_time);
  if v_checkout_minutes <= v_checkin_minutes and v_local_minutes < v_checkin_minutes then
    v_local_minutes := v_local_minutes + 1440;
    v_checkout_minutes := v_checkout_minutes + 1440;
  end if;
  v_early_limit := v_checkout_minutes - coalesce(v_schedule.early_checkout_tolerance_minutes, 0);
  v_early := v_local_minutes < v_early_limit;
  v_status := case
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
      is_overtime = false,
      overtime_note = null
  where id = v_record.id;

  return query select * from public.attendance where id = v_record.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC lembur pegawai/admin
-- ---------------------------------------------------------------------------

create or replace function public.employee_list_approved_overtime_requests(p_guard_id uuid, p_pin text)
returns setof public.leave_requests language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.guards where id = p_guard_id and pin = p_pin and is_active = true) then
    raise exception 'Akun pegawai tidak valid.';
  end if;
  return query
  select r.*
  from public.leave_requests r
  where r.guard_id = p_guard_id
    and r.jenis = 'lembur'
    and r.status = 'approved'
    and (now() at time zone 'Asia/Makassar')::date between r.tanggal_mulai and r.tanggal_selesai
  order by r.created_at desc;
end;
$$;

create or replace function public.employee_get_overtime_today(p_guard_id uuid, p_pin text, p_date date)
returns setof public.overtime_attendance language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.guards where id = p_guard_id and pin = p_pin and is_active = true) then
    raise exception 'Akun pegawai tidak valid.';
  end if;
  return query
  select * from public.overtime_attendance
  where guard_id = p_guard_id and date = p_date
  order by created_at desc
  limit 1;
end;
$$;

create or replace function public.employee_start_overtime(
  p_guard_id uuid, p_pin text, p_request_id uuid, p_date date, p_time timestamptz,
  p_latitude numeric, p_longitude numeric, p_selfie_url text, p_note text
) returns setof public.overtime_attendance language plpgsql security definer set search_path = public as $$
declare
  v_guard public.guards%rowtype;
  v_request public.leave_requests%rowtype;
  v_id uuid;
begin
  select * into v_guard from public.guards where id = p_guard_id and pin = p_pin and is_active = true;
  if not found then raise exception 'Akun pegawai tidak valid.'; end if;
  if nullif(trim(p_note), '') is null then raise exception 'Keterangan lembur wajib diisi.'; end if;
  if nullif(p_selfie_url, '') is null then raise exception 'Selfie lembur wajib diisi.'; end if;
  select * into v_request from public.leave_requests
  where id = p_request_id and guard_id = p_guard_id and jenis = 'lembur' and status = 'approved';
  if not found then raise exception 'Absen lembur hanya dapat dilakukan setelah pengajuan lembur disetujui admin.'; end if;
  if exists (select 1 from public.overtime_attendance where request_id = p_request_id and status = 'berjalan') then
    raise exception 'Lembur masih berjalan.';
  end if;

  insert into public.overtime_attendance(
    guard_id, guard_name, bagian, date, request_id, overtime_start_time,
    start_latitude, start_longitude, start_selfie_url, note, status
  ) values (
    v_guard.id, v_guard.name, v_guard.bagian, p_date, p_request_id, now(),
    p_latitude, p_longitude, p_selfie_url,
    concat_ws(' | ', trim(p_note), nullif(public.default_location_warning(p_latitude, p_longitude), '')),
    'berjalan'
  ) returning id into v_id;
  return query select * from public.overtime_attendance where id = v_id;
end;
$$;

create or replace function public.employee_finish_overtime(
  p_guard_id uuid, p_pin text, p_overtime_id uuid, p_time timestamptz,
  p_latitude numeric, p_longitude numeric, p_selfie_url text, p_note text
) returns setof public.overtime_attendance language plpgsql security definer set search_path = public as $$
declare
  v_record public.overtime_attendance%rowtype;
  v_minutes integer;
begin
  if not exists (select 1 from public.guards where id = p_guard_id and pin = p_pin and is_active = true) then
    raise exception 'Akun pegawai tidak valid.';
  end if;
  if nullif(p_selfie_url, '') is null then raise exception 'Selfie lembur wajib diisi.'; end if;
  select * into v_record from public.overtime_attendance
  where id = p_overtime_id and guard_id = p_guard_id and status = 'berjalan'
  for update;
  if not found then raise exception 'Data lembur berjalan tidak ditemukan.'; end if;

  v_minutes := greatest(0, floor(extract(epoch from (now() - v_record.overtime_start_time)) / 60)::integer);
  update public.overtime_attendance
  set overtime_end_time = now(),
      overtime_duration = format('%s jam %s menit', v_minutes / 60, mod(v_minutes, 60)),
      end_latitude = p_latitude,
      end_longitude = p_longitude,
      end_selfie_url = p_selfie_url,
      note = concat_ws(' | ', nullif(v_record.note, ''), nullif(trim(p_note), ''), nullif(public.default_location_warning(p_latitude, p_longitude), '')),
      status = 'selesai'
  where id = v_record.id;
  return query select * from public.overtime_attendance where id = v_record.id;
end;
$$;

create or replace function public.admin_list_overtime_attendance(p_token text, p_start date, p_end date)
returns setof public.overtime_attendance language plpgsql security definer set search_path = public as $$
declare v_admin public.admin_users%rowtype;
begin
  v_admin := public.get_admin_by_token(p_token);
  if v_admin.id is null then raise exception 'Anda tidak memiliki akses'; end if;
  return query
  select o.* from public.overtime_attendance o
  where o.date between p_start and p_end
    and public.admin_has_bagian_access(v_admin, o.bagian)
  order by o.date desc, o.overtime_start_time desc nulls last;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC pengaturan shift
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_work_schedules(p_token text)
returns setof public.work_schedules language plpgsql security definer set search_path = public as $$
declare v_admin public.admin_users%rowtype;
begin
  v_admin := public.get_admin_by_token(p_token);
  if v_admin.id is null or v_admin.role <> 'super_admin' then raise exception 'Anda tidak memiliki akses'; end if;
  return query select * from public.work_schedules order by array_position(array['Reguler','Pagi','Siang','Malam'], shift_name);
end;
$$;

create or replace function public.admin_save_work_schedule(
  p_token text, p_id uuid, p_shift_name text, p_check_in_time time, p_check_out_time time,
  p_late_tolerance_minutes integer, p_early_checkout_tolerance_minutes integer, p_is_active boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_admin public.admin_users%rowtype;
  v_id uuid;
begin
  v_admin := public.get_admin_by_token(p_token);
  if v_admin.id is null or v_admin.role <> 'super_admin' then raise exception 'Anda tidak memiliki akses'; end if;
  if p_shift_name not in ('Reguler', 'Pagi', 'Siang', 'Malam') then raise exception 'Shift tidak valid.'; end if;
  insert into public.work_schedules(id, shift_name, check_in_time, check_out_time, late_tolerance_minutes, early_checkout_tolerance_minutes, is_active)
  values (coalesce(p_id, gen_random_uuid()), p_shift_name, p_check_in_time, p_check_out_time,
          greatest(0, coalesce(p_late_tolerance_minutes, 0)),
          greatest(0, coalesce(p_early_checkout_tolerance_minutes, 0)),
          coalesce(p_is_active, true))
  on conflict (shift_name) do update
    set check_in_time = excluded.check_in_time,
        check_out_time = excluded.check_out_time,
        late_tolerance_minutes = excluded.late_tolerance_minutes,
        early_checkout_tolerance_minutes = excluded.early_checkout_tolerance_minutes,
        is_active = excluded.is_active
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC revisi keputusan dan audit pengajuan
-- ---------------------------------------------------------------------------

create or replace function public.admin_decide_request(p_token text, p_request_id uuid, p_status text, p_catatan text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_admin public.admin_users%rowtype;
  v_request public.leave_requests%rowtype;
begin
  v_admin := public.get_admin_by_token(p_token);
  if v_admin.id is null then raise exception 'Anda tidak memiliki akses'; end if;
  if p_status not in ('pending', 'approved', 'rejected') then raise exception 'Status keputusan tidak valid.'; end if;
  select * into v_request from public.leave_requests where id = p_request_id for update;
  if not found or not public.admin_has_bagian_access(v_admin, v_request.bagian) then raise exception 'Anda tidak memiliki akses'; end if;
  if v_admin.role <> 'super_admin' and v_request.status <> 'pending' then
    raise exception 'Hanya Super Admin yang dapat mengubah keputusan yang sudah final.';
  end if;
  if v_admin.role <> 'super_admin' and p_status = 'pending' then
    raise exception 'Hanya Super Admin yang dapat mengembalikan status menjadi menunggu.';
  end if;
  update public.leave_requests
  set status = p_status,
      catatan_admin = nullif(trim(p_catatan), ''),
      decided_by = v_admin.id,
      decided_at = now()
  where id = p_request_id;
  insert into public.request_logs(request_id, admin_id, old_status, new_status, note)
  values (p_request_id, v_admin.id, v_request.status, p_status, nullif(trim(p_catatan), ''));
end;
$$;

create or replace function public.admin_list_request_logs(p_token text, p_request_id uuid)
returns setof public.request_logs language plpgsql security definer set search_path = public as $$
declare
  v_admin public.admin_users%rowtype;
  v_bagian text;
begin
  v_admin := public.get_admin_by_token(p_token);
  if v_admin.id is null then raise exception 'Anda tidak memiliki akses'; end if;
  select bagian into v_bagian from public.leave_requests where id = p_request_id;
  if v_bagian is null or not public.admin_has_bagian_access(v_admin, v_bagian) then raise exception 'Anda tidak memiliki akses'; end if;
  return query select * from public.request_logs where request_id = p_request_id order by created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC pemberitahuan
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_announcements(p_token text)
returns setof public.announcements language plpgsql security definer set search_path = public as $$
declare v_admin public.admin_users%rowtype;
begin
  v_admin := public.get_admin_by_token(p_token);
  if v_admin.id is null or v_admin.role <> 'super_admin' then raise exception 'Anda tidak memiliki akses'; end if;
  return query select * from public.announcements order by created_at desc;
end;
$$;

create or replace function public.admin_save_announcement(
  p_token text, p_id uuid, p_title text, p_message text, p_target_bagian text,
  p_priority text, p_start_date date, p_end_date date, p_is_active boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_admin public.admin_users%rowtype;
  v_id uuid;
begin
  v_admin := public.get_admin_by_token(p_token);
  if v_admin.id is null or v_admin.role <> 'super_admin' then raise exception 'Anda tidak memiliki akses'; end if;
  if p_target_bagian not in ('Semua', 'Pramubakti', 'Cleaning Service', 'Satpam', 'Teknisi', 'Driver') then raise exception 'Target bagian tidak valid.'; end if;
  if p_priority not in ('normal', 'penting', 'darurat') then raise exception 'Prioritas tidak valid.'; end if;
  if p_end_date < p_start_date then raise exception 'Tanggal selesai tidak boleh sebelum mulai.'; end if;
  if p_id is null then
    insert into public.announcements(title, message, target_bagian, priority, start_date, end_date, is_active, created_by)
    values (trim(p_title), trim(p_message), p_target_bagian, p_priority, p_start_date, p_end_date, p_is_active, v_admin.id)
    returning id into v_id;
  else
    update public.announcements
    set title = trim(p_title),
        message = trim(p_message),
        target_bagian = p_target_bagian,
        priority = p_priority,
        start_date = p_start_date,
        end_date = p_end_date,
        is_active = p_is_active
    where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_delete_announcement(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_admin public.admin_users%rowtype;
begin
  v_admin := public.get_admin_by_token(p_token);
  if v_admin.id is null or v_admin.role <> 'super_admin' then raise exception 'Anda tidak memiliki akses'; end if;
  delete from public.announcements where id = p_id;
end;
$$;

create or replace function public.employee_list_announcements(p_guard_id uuid, p_pin text)
returns table (
  id uuid, title text, message text, target_bagian text, priority text,
  start_date date, end_date date, is_active boolean, created_at timestamptz, updated_at timestamptz, read_at timestamptz
) language plpgsql security definer set search_path = public as $$
declare v_guard public.guards%rowtype;
begin
  select * into v_guard from public.guards where id = p_guard_id and pin = p_pin and is_active = true;
  if not found then raise exception 'Akun pegawai tidak valid.'; end if;
  return query
  select a.id, a.title, a.message, a.target_bagian, a.priority, a.start_date, a.end_date, a.is_active, a.created_at, a.updated_at, r.read_at
  from public.announcements a
  left join public.announcement_reads r on r.announcement_id = a.id and r.guard_id = v_guard.id
  where a.is_active = true
    and (now() at time zone 'Asia/Makassar')::date between a.start_date and a.end_date
    and (a.target_bagian = 'Semua' or a.target_bagian = v_guard.bagian)
  order by case a.priority when 'darurat' then 0 when 'penting' then 1 else 2 end, a.created_at desc;
end;
$$;

create or replace function public.employee_mark_announcement_read(p_guard_id uuid, p_pin text, p_announcement_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.guards where id = p_guard_id and pin = p_pin and is_active = true) then
    raise exception 'Akun pegawai tidak valid.';
  end if;
  insert into public.announcement_reads(announcement_id, guard_id)
  values (p_announcement_id, p_guard_id)
  on conflict (announcement_id, guard_id) do update set read_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS dan grant
-- ---------------------------------------------------------------------------

alter table public.work_schedules enable row level security;
alter table public.overtime_attendance enable row level security;
alter table public.request_logs enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;

revoke all on public.work_schedules from anon, authenticated;
revoke all on public.overtime_attendance from anon, authenticated;
revoke all on public.request_logs from anon, authenticated;
revoke all on public.announcements from anon, authenticated;
revoke all on public.announcement_reads from anon, authenticated;

grant execute on function public.get_work_schedule_by_shift(text) to anon, authenticated;
grant execute on function public.admin_list_work_schedules(text) to anon, authenticated;
grant execute on function public.admin_save_work_schedule(text, uuid, text, time, time, integer, integer, boolean) to anon, authenticated;
grant execute on function public.employee_list_approved_overtime_requests(uuid, text) to anon, authenticated;
grant execute on function public.employee_get_overtime_today(uuid, text, date) to anon, authenticated;
grant execute on function public.employee_start_overtime(uuid, text, uuid, date, timestamptz, numeric, numeric, text, text) to anon, authenticated;
grant execute on function public.employee_finish_overtime(uuid, text, uuid, timestamptz, numeric, numeric, text, text) to anon, authenticated;
grant execute on function public.admin_list_overtime_attendance(text, date, date) to anon, authenticated;
grant execute on function public.admin_list_request_logs(text, uuid) to anon, authenticated;
grant execute on function public.admin_list_announcements(text) to anon, authenticated;
grant execute on function public.admin_save_announcement(text, uuid, text, text, text, text, date, date, boolean) to anon, authenticated;
grant execute on function public.admin_delete_announcement(text, uuid) to anon, authenticated;
grant execute on function public.employee_list_announcements(uuid, text) to anon, authenticated;
grant execute on function public.employee_mark_announcement_read(uuid, text, uuid) to anon, authenticated;
