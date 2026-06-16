import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const SUPABASE_URL = "YOUR_SUPABASE_URL";
export const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
export const SELFIE_BUCKET = "attendance-selfies";
export const PROFILE_BUCKET = "profile-photos";
export const REQUEST_BUCKET = "request-proofs";

export const isDemoMode = new URLSearchParams(location.search).get("demo") === "1";
export const isConfigured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR_") &&
  !SUPABASE_ANON_KEY.includes("YOUR_");

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    })
  : null;

export const BAGIAN_VALUES = ["Pramubakti", "Cleaning Service", "Satpam", "Teknisi", "Driver"];
export const ADMIN_BAGIAN_VALUES = ["Semua", ...BAGIAN_VALUES];
export const ROLE_LABELS = {
  super_admin: "Super Admin",
  admin_umum: "Admin Umum",
  admin_bagian: "Admin Bagian"
};
export const REQUEST_LABELS = { izin: "Izin", sakit: "Sakit", cuti: "Cuti", lembur: "Lembur" };
export const REQUEST_STATUS_LABELS = { pending: "Menunggu", approved: "Disetujui", rejected: "Ditolak" };

const KEYS = {
  employees: "gkn_demo_employees_v2",
  attendance: "gkn_demo_attendance_v2",
  requests: "gkn_demo_requests_v2",
  admins: "gkn_demo_admins_v2",
  sessions: "gkn_demo_admin_sessions_v2",
  office: "gkn_demo_office_v2"
};

function uuid() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function localDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function read(key, fallback = []) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function publicEmployee(row) { const { pin, ...safe } = row; return safe; }
function publicAdmin(row) { const { password, ...safe } = row; return safe; }
function nowIso() { return new Date().toISOString(); }

const employeeSeed = [
  ["Abdul Haris", "Satpam", ""],
  ["Mustar / Gino", "Satpam", ""],
  ["Asriyadi", "Satpam", ""],
  ["Jono M. Pandu", "Satpam", ""],
  ["Muh. Nasri", "Satpam", ""],
  ["Padli", "Satpam", ""],
  ["GAT", "Satpam", ""],
  ["Firnas", "Satpam", ""],
  ["Ismail", "Satpam", "Koordinator Umum Satpam"],
  ["Sabri", "Satpam", ""],
  ["Darmawan", "Satpam", ""],
  ["Ibrahim", "Satpam", ""],
  ["Irwan", "Satpam", ""],
  ["Muh. Quraish A", "Satpam", ""],
  ["Syamsu Alim", "Satpam", ""],
  ["Kaharuddin", "Satpam", ""],
  ["Rusdin", "Satpam", ""],
  ["Anwar Wahyu", "Satpam", ""],
  ["Sucipto", "Satpam", ""],
  ["Sania", "Satpam", ""],
  ["Gusti Pidun Paonganan", "Satpam", ""],
  ["Yusril", "Satpam", ""],
  ["Irsal Priyadi", "Satpam", ""],
  ["Herman Habe", "Satpam", ""],
  ["Ikbal", "Satpam", ""],
  ["Irfandi", "Satpam", ""],
  ["Kisman", "Satpam", ""],
  ["M. Darwis", "Satpam", ""],
  ["Fahmi Salam", "Pramubakti", ""],
  ["Wenda Monika", "Pramubakti", ""],
  ["Saiful Anwar", "Pramubakti", ""],
  ["Muh. Arsal", "Driver", ""],
  ["Muh. Aldi", "Teknisi", ""],
  ["Aswadi", "Teknisi", "Koordinator Umum Non Satpam"]
];

const adminSeed = [
  ["Super Admin", "superadmin", "GKN-Super-2026!", "super_admin", "Semua"],
  ["Admin Umum", "adminumum", "GKN-Umum-2026!", "admin_umum", "Semua"],
  ["Admin Satpam", "adminsatpam", "Satpam-2026!", "admin_bagian", "Satpam"],
  ["Admin Teknisi", "adminteknisi", "Teknisi-2026!", "admin_bagian", "Teknisi"],
  ["Admin Pramubakti", "adminpramubakti", "Pramubakti-2026!", "admin_bagian", "Pramubakti"],
  ["Admin Cleaning Service", "admincleaning", "Cleaning-2026!", "admin_bagian", "Cleaning Service"],
  ["Admin Driver", "admindriver", "Driver-2026!", "admin_bagian", "Driver"]
];

function seedDemo() {
  if (!isDemoMode || localStorage.getItem(KEYS.employees)) return;
  const t = nowIso();
  const employees = employeeSeed.map(([name, bagian, bio], index) => ({
    id: uuid(), name, pin: "1234", bagian, shift: bagian === "Satpam" ? "Pagi" : "Reguler",
    phone: "", photo_url: "", bio, is_active: true, created_at: t, updated_at: t,
    seed_no: index + 1
  }));
  const admins = adminSeed.map(([nama, username, password, role, bagian]) => ({
    id: uuid(), nama, username, password, role, bagian, status: "aktif", created_at: t, updated_at: t
  }));
  const today = localDateKey();
  const first = employees[0];
  const attendance = [{
    id: uuid(), guard_id: first.id, guard_name: first.name, bagian: first.bagian, shift: first.shift,
    date: today, check_in_time: new Date(`${today}T07:25:00+08:00`).toISOString(),
    check_out_time: null, work_duration: null, status: "Hadir",
    check_in_latitude: -2.6779, check_in_longitude: 118.8865,
    check_out_latitude: null, check_out_longitude: null,
    check_in_selfie_url: "", check_out_selfie_url: "",
    check_in_note: "", check_out_note: "", is_overtime: false, overtime_note: "",
    created_at: t, updated_at: t
  }];
  const requests = [{
    id: uuid(), guard_id: first.id, guard_name: first.name, bagian: first.bagian,
    jenis: "izin", tanggal_mulai: today, tanggal_selesai: today, alasan: "Keperluan keluarga.",
    bukti_url: "", status: "pending", catatan_admin: "", decided_by: null, decided_at: null,
    created_at: t, updated_at: t
  }];
  write(KEYS.employees, employees);
  write(KEYS.admins, admins);
  write(KEYS.attendance, attendance);
  write(KEYS.requests, requests);
  write(KEYS.sessions, []);
  write(KEYS.office, { id: uuid(), nama_lokasi: "GKN Mamuju", latitude: -2.6779, longitude: 118.8865, radius_meter: 150, is_default: true, created_at: t, updated_at: t });
}
seedDemo();

function requireBackend() {
  if (!isDemoMode && !isConfigured) throw new Error("Supabase belum dikonfigurasi. Isi SUPABASE_URL dan SUPABASE_ANON_KEY.");
}
function throwIfError(error) {
  if (error) throw new Error(error.message || "Terjadi kesalahan pada Supabase.");
}

function demoAdmin(token) {
  const sessions = read(KEYS.sessions);
  const session = sessions.find((item) => item.token === token && new Date(item.expires_at) > new Date());
  const admin = read(KEYS.admins).find((item) => item.id === session?.admin_id);
  if (!admin || admin.status !== "aktif") throw new Error("Sesi admin tidak valid atau sudah berakhir.");
  return admin;
}
function canAccessBagian(admin, bagian) {
  return admin.role === "super_admin" || admin.role === "admin_umum" || (admin.role === "admin_bagian" && admin.bagian === bagian);
}
function requireSuper(admin) {
  if (admin.role !== "super_admin") throw new Error("Anda tidak memiliki akses");
}
async function fileToDataUrl(file) {
  if (!file) return "";
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("File gagal dibaca."));
    reader.readAsDataURL(file);
  });
}
async function upload(bucket, path, file) {
  if (!file) return "";
  requireBackend();
  if (isDemoMode) return fileToDataUrl(file);
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "application/octet-stream"
  });
  throwIfError(error);
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
function minutesBetween(a, b) {
  return Math.max(0, Math.floor((new Date(b) - new Date(a)) / 60000));
}
function durationText(minutes) {
  return `${Math.floor(minutes / 60)} jam ${minutes % 60} menit`;
}
function distanceMeters(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const toRad = (n) => n * Math.PI / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}
function locationWarning(lat, lng) {
  const office = read(KEYS.office, null);
  if (!office || lat == null || lng == null) return "";
  const distance = distanceMeters(Number(office.latitude), Number(office.longitude), Number(lat), Number(lng));
  return distance > Number(office.radius_meter) ? `Peringatan: di luar radius ${office.radius_meter} m. Jarak sekitar ${distance} m.` : "";
}

export const api = {
  async uploadSelfie(file, employeeId, kind) {
    return upload(SELFIE_BUCKET, `${employeeId}/${kind}-${Date.now()}-${file?.name || "selfie.jpg"}`, file);
  },
  async uploadProfilePhoto(file, employeeId) {
    return upload(PROFILE_BUCKET, `${employeeId}/${Date.now()}-${file?.name || "profile.jpg"}`, file);
  },
  async uploadRequestProof(file, employeeId) {
    return upload(REQUEST_BUCKET, `${employeeId}/${Date.now()}-${file?.name || "proof"}`, file);
  },
  async getOfficeLocation() {
    requireBackend();
    if (isDemoMode) return read(KEYS.office, null);
    const { data, error } = await supabase.rpc("get_office_location");
    throwIfError(error);
    return data?.[0] || null;
  },
  async loginGuard(name, pin) {
    requireBackend();
    if (isDemoMode) {
      const employee = read(KEYS.employees).find((item) => item.is_active && item.name.toLowerCase() === name.trim().toLowerCase() && item.pin === pin);
      if (!employee) throw new Error("Nama atau PIN pegawai tidak sesuai, atau akun nonaktif.");
      return publicEmployee(employee);
    }
    const { data, error } = await supabase.rpc("login_guard", { p_name: name.trim(), p_pin: pin });
    throwIfError(error);
    if (!data?.length) throw new Error("Nama atau PIN pegawai tidak sesuai, atau akun nonaktif.");
    return data[0];
  },
  async updateEmployeeProfile(employeeId, pin, payload) {
    requireBackend();
    if (isDemoMode) {
      const rows = read(KEYS.employees);
      const index = rows.findIndex((item) => item.id === employeeId && item.pin === pin && item.is_active);
      if (index < 0) throw new Error("Akun pegawai tidak valid.");
      rows[index] = { ...rows[index], ...payload, pin: payload.pin || rows[index].pin, updated_at: nowIso() };
      write(KEYS.employees, rows);
      return publicEmployee(rows[index]);
    }
    const { data, error } = await supabase.rpc("employee_update_profile", {
      p_guard_id: employeeId,
      p_pin: pin,
      p_photo_url: payload.photo_url || null,
      p_bio: payload.bio || "",
      p_new_pin: payload.pin || null
    });
    throwIfError(error);
    return data?.[0] || null;
  },
  async getDailyAttendance(employeeId, pin, date) {
    requireBackend();
    if (isDemoMode) return read(KEYS.attendance).find((item) => item.guard_id === employeeId && item.date === date) || null;
    const { data, error } = await supabase.rpc("get_guard_daily_attendance", { p_guard_id: employeeId, p_pin: pin, p_date: date });
    throwIfError(error);
    return data?.[0] || null;
  },
  async listEmployeeAttendance(employeeId, pin) {
    requireBackend();
    if (isDemoMode) return read(KEYS.attendance).filter((item) => item.guard_id === employeeId).sort((a, b) => b.date.localeCompare(a.date));
    const { data, error } = await supabase.rpc("employee_list_attendance", { p_guard_id: employeeId, p_pin: pin });
    throwIfError(error);
    return data || [];
  },
  async checkIn(payload) {
    requireBackend();
    if (isDemoMode) {
      const employees = read(KEYS.employees);
      const employee = employees.find((item) => item.id === payload.guardId && item.pin === payload.pin && item.is_active);
      if (!employee) throw new Error("Akun pegawai tidak valid.");
      const rows = read(KEYS.attendance);
      if (rows.some((item) => item.guard_id === employee.id && item.date === payload.date)) throw new Error("Anda sudah absen masuk hari ini.");
      const localTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(payload.checkInTime));
      const warning = locationWarning(payload.latitude, payload.longitude);
      const record = {
        id: uuid(), guard_id: employee.id, guard_name: employee.name, bagian: employee.bagian, shift: employee.shift,
        date: payload.date, check_in_time: payload.checkInTime, check_out_time: null, work_duration: null,
        status: localTime > "07:35" ? "Terlambat" : "Hadir",
        check_in_latitude: payload.latitude, check_in_longitude: payload.longitude,
        check_out_latitude: null, check_out_longitude: null,
        check_in_selfie_url: payload.selfieUrl, check_out_selfie_url: "",
        check_in_note: [payload.note, warning].filter(Boolean).join(" | "),
        check_out_note: "", is_overtime: false, overtime_note: "",
        created_at: nowIso(), updated_at: nowIso()
      };
      rows.push(record);
      write(KEYS.attendance, rows);
      return record;
    }
    const { data, error } = await supabase.rpc("guard_check_in", {
      p_guard_id: payload.guardId,
      p_pin: payload.pin,
      p_date: payload.date,
      p_check_in_time: payload.checkInTime,
      p_latitude: payload.latitude,
      p_longitude: payload.longitude,
      p_selfie_url: payload.selfieUrl,
      p_note: payload.note || ""
    });
    throwIfError(error);
    return data?.[0] || null;
  },
  async checkOut(payload) {
    requireBackend();
    if (isDemoMode) {
      const employees = read(KEYS.employees);
      const employee = employees.find((item) => item.id === payload.guardId && item.pin === payload.pin && item.is_active);
      if (!employee) throw new Error("Akun pegawai tidak valid.");
      const rows = read(KEYS.attendance);
      const index = rows.findIndex((item) => item.guard_id === employee.id && item.date === payload.date);
      if (index < 0) throw new Error("Anda belum absen masuk hari ini.");
      if (rows[index].check_out_time) throw new Error("Anda sudah absen pulang hari ini.");
      const localTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(payload.checkOutTime));
      const early = localTime < "17:00";
      const late = rows[index].status === "Terlambat";
      const warning = locationWarning(payload.latitude, payload.longitude);
      let status = rows[index].status;
      if (payload.isOvertime) status = "Lembur";
      else if (late && early) status = "Terlambat dan Pulang Cepat";
      else if (early) status = "Pulang Cepat";
      rows[index] = {
        ...rows[index],
        check_out_time: payload.checkOutTime,
        work_duration: durationText(minutesBetween(rows[index].check_in_time, payload.checkOutTime)),
        status,
        check_out_latitude: payload.latitude,
        check_out_longitude: payload.longitude,
        check_out_selfie_url: payload.selfieUrl,
        check_out_note: [payload.note, warning].filter(Boolean).join(" | "),
        is_overtime: Boolean(payload.isOvertime),
        overtime_note: payload.overtimeNote || "",
        updated_at: nowIso()
      };
      write(KEYS.attendance, rows);
      return rows[index];
    }
    const { data, error } = await supabase.rpc("guard_check_out", {
      p_guard_id: payload.guardId,
      p_pin: payload.pin,
      p_date: payload.date,
      p_check_out_time: payload.checkOutTime,
      p_latitude: payload.latitude,
      p_longitude: payload.longitude,
      p_selfie_url: payload.selfieUrl,
      p_note: payload.note || "",
      p_is_overtime: Boolean(payload.isOvertime),
      p_overtime_note: payload.overtimeNote || ""
    });
    throwIfError(error);
    return data?.[0] || null;
  },
  async submitEmployeeRequest(employeeId, pin, payload) {
    requireBackend();
    if (isDemoMode) {
      const employee = read(KEYS.employees).find((item) => item.id === employeeId && item.pin === pin && item.is_active);
      if (!employee) throw new Error("Akun pegawai tidak valid.");
      const rows = read(KEYS.requests);
      rows.unshift({
        id: uuid(), guard_id: employee.id, guard_name: employee.name, bagian: employee.bagian,
        ...payload, status: "pending", catatan_admin: "", decided_by: null, decided_at: null,
        created_at: nowIso(), updated_at: nowIso()
      });
      write(KEYS.requests, rows);
      return;
    }
    const { error } = await supabase.rpc("employee_submit_request", {
      p_guard_id: employeeId,
      p_pin: pin,
      p_jenis: payload.jenis,
      p_tanggal_mulai: payload.tanggal_mulai,
      p_tanggal_selesai: payload.tanggal_selesai,
      p_alasan: payload.alasan,
      p_bukti_url: payload.bukti_url || ""
    });
    throwIfError(error);
  },
  async listEmployeeRequests(employeeId, pin) {
    requireBackend();
    if (isDemoMode) return read(KEYS.requests).filter((item) => item.guard_id === employeeId);
    const { data, error } = await supabase.rpc("employee_list_requests", { p_guard_id: employeeId, p_pin: pin });
    throwIfError(error);
    return data || [];
  },
  async adminLogin(username, password) {
    requireBackend();
    if (isDemoMode) {
      const admin = read(KEYS.admins).find((item) => item.username.toLowerCase() === username.trim().toLowerCase() && item.password === password);
      if (!admin) throw new Error("Username atau password/PIN admin tidak sesuai.");
      if (admin.status !== "aktif") throw new Error("Akun admin nonaktif tidak boleh login.");
      const session = { token: uuid() + uuid(), admin_id: admin.id, expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), created_at: nowIso() };
      write(KEYS.sessions, [...read(KEYS.sessions).filter((item) => new Date(item.expires_at) > new Date()), session]);
      return { session_token: session.token, expires_at: session.expires_at, admin: publicAdmin(admin) };
    }
    const { data, error } = await supabase.rpc("admin_login", { p_username: username.trim(), p_password: password });
    throwIfError(error);
    const row = data?.[0];
    if (!row) throw new Error("Login admin gagal.");
    return { session_token: row.session_token, expires_at: row.expires_at, admin: { id: row.admin_id, nama: row.nama, username: row.username, role: row.role, bagian: row.bagian, status: row.status } };
  },
  async adminGetProfile(token) {
    requireBackend();
    if (isDemoMode) return publicAdmin(demoAdmin(token));
    const { data, error } = await supabase.rpc("admin_get_profile", { p_token: token });
    throwIfError(error);
    return data?.[0] || null;
  },
  async adminLogout(token) {
    if (!token) return;
    if (isDemoMode) return write(KEYS.sessions, read(KEYS.sessions).filter((item) => item.token !== token));
    const { error } = await supabase.rpc("admin_logout", { p_token: token });
    throwIfError(error);
  },
  async listEmployees(token) {
    requireBackend();
    if (isDemoMode) {
      const admin = demoAdmin(token);
      return read(KEYS.employees).filter((item) => canAccessBagian(admin, item.bagian)).map(publicEmployee).sort((a, b) => a.bagian.localeCompare(b.bagian) || a.name.localeCompare(b.name));
    }
    const { data, error } = await supabase.rpc("admin_list_employees", { p_token: token });
    throwIfError(error);
    return data || [];
  },
  async saveEmployee(token, payload) {
    requireBackend();
    if (isDemoMode) {
      const admin = demoAdmin(token);
      requireSuper(admin);
      const rows = read(KEYS.employees);
      if (payload.id) {
        const index = rows.findIndex((item) => item.id === payload.id);
        if (index < 0) throw new Error("Data pegawai tidak ditemukan.");
        rows[index] = { ...rows[index], ...payload, pin: payload.pin || rows[index].pin, updated_at: nowIso() };
      } else {
        rows.push({ id: uuid(), ...payload, pin: payload.pin || "1234", photo_url: payload.photo_url || "", bio: payload.bio || "", created_at: nowIso(), updated_at: nowIso() });
      }
      write(KEYS.employees, rows);
      return;
    }
    const { error } = await supabase.rpc("admin_save_employee", {
      p_token: token,
      p_id: payload.id || null,
      p_name: payload.name,
      p_pin: payload.pin || null,
      p_bagian: payload.bagian,
      p_shift: payload.shift,
      p_phone: payload.phone || "",
      p_photo_url: payload.photo_url || "",
      p_bio: payload.bio || "",
      p_is_active: Boolean(payload.is_active)
    });
    throwIfError(error);
  },
  async deleteEmployee(token, id) {
    requireBackend();
    if (isDemoMode) {
      requireSuper(demoAdmin(token));
      write(KEYS.employees, read(KEYS.employees).filter((item) => item.id !== id));
      return;
    }
    const { error } = await supabase.rpc("admin_delete_employee", { p_token: token, p_guard_id: id });
    throwIfError(error);
  },
  async listAttendance(token, start, end) {
    requireBackend();
    if (isDemoMode) {
      const admin = demoAdmin(token);
      return read(KEYS.attendance).filter((item) => item.date >= start && item.date <= end && canAccessBagian(admin, item.bagian)).sort((a, b) => b.date.localeCompare(a.date));
    }
    const { data, error } = await supabase.rpc("admin_list_attendance", { p_token: token, p_start: start, p_end: end });
    throwIfError(error);
    return data || [];
  },
  async listRequests(token, jenis = null) {
    requireBackend();
    if (isDemoMode) {
      const admin = demoAdmin(token);
      return read(KEYS.requests).filter((item) => (!jenis || item.jenis === jenis) && canAccessBagian(admin, item.bagian));
    }
    const { data, error } = await supabase.rpc("admin_list_requests", { p_token: token, p_jenis: jenis });
    throwIfError(error);
    return data || [];
  },
  async decideRequest(token, id, status, note = "") {
    requireBackend();
    if (isDemoMode) {
      const admin = demoAdmin(token);
      const rows = read(KEYS.requests);
      const index = rows.findIndex((item) => item.id === id);
      if (index < 0 || !canAccessBagian(admin, rows[index].bagian)) throw new Error("Anda tidak memiliki akses");
      rows[index] = { ...rows[index], status, catatan_admin: note, decided_by: admin.id, decided_at: nowIso(), updated_at: nowIso() };
      write(KEYS.requests, rows);
      return;
    }
    const { error } = await supabase.rpc("admin_decide_request", { p_token: token, p_request_id: id, p_status: status, p_catatan: note });
    throwIfError(error);
  },
  async listAdmins(token) {
    requireBackend();
    if (isDemoMode) {
      requireSuper(demoAdmin(token));
      return read(KEYS.admins).map(publicAdmin);
    }
    const { data, error } = await supabase.rpc("admin_list_users", { p_token: token });
    throwIfError(error);
    return data || [];
  },
  async saveAdmin(token, payload) {
    requireBackend();
    if (isDemoMode) {
      requireSuper(demoAdmin(token));
      const rows = read(KEYS.admins);
      const bagian = payload.role === "admin_bagian" ? payload.bagian : "Semua";
      if (payload.id) {
        const index = rows.findIndex((item) => item.id === payload.id);
        if (index < 0) throw new Error("Data admin tidak ditemukan.");
        rows[index] = { ...rows[index], ...payload, bagian, password: payload.password || rows[index].password, updated_at: nowIso() };
      } else {
        rows.push({ id: uuid(), ...payload, bagian, password: payload.password, created_at: nowIso(), updated_at: nowIso() });
      }
      write(KEYS.admins, rows);
      return;
    }
    const { error } = await supabase.rpc("admin_save_user", {
      p_token: token,
      p_id: payload.id || null,
      p_nama: payload.nama,
      p_username: payload.username,
      p_password: payload.password || null,
      p_role: payload.role,
      p_bagian: payload.bagian,
      p_status: payload.status
    });
    throwIfError(error);
  },
  async deleteAdmin(token, id) {
    requireBackend();
    if (isDemoMode) {
      requireSuper(demoAdmin(token));
      write(KEYS.admins, read(KEYS.admins).filter((item) => item.id !== id));
      return;
    }
    const { error } = await supabase.rpc("admin_delete_user", { p_token: token, p_admin_id: id });
    throwIfError(error);
  },
  async adminGetOfficeLocation(token) {
    requireBackend();
    if (isDemoMode) {
      demoAdmin(token);
      return read(KEYS.office, null);
    }
    const { data, error } = await supabase.rpc("admin_get_office_location", { p_token: token });
    throwIfError(error);
    return data?.[0] || null;
  },
  async adminSaveOfficeLocation(token, payload) {
    requireBackend();
    if (isDemoMode) {
      requireSuper(demoAdmin(token));
      write(KEYS.office, { id: payload.id || uuid(), ...payload, is_default: true, updated_at: nowIso(), created_at: payload.created_at || nowIso() });
      return;
    }
    const { error } = await supabase.rpc("admin_save_office_location", {
      p_token: token,
      p_nama_lokasi: payload.nama_lokasi,
      p_latitude: Number(payload.latitude),
      p_longitude: Number(payload.longitude),
      p_radius_meter: Number(payload.radius_meter)
    });
    throwIfError(error);
  }
};
