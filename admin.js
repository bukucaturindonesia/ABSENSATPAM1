import { api, isConfigured, isDemoMode, BAGIAN_VALUES, ADMIN_BAGIAN_VALUES, ROLE_LABELS, REQUEST_LABELS, REQUEST_STATUS_LABELS } from "./supabase.js";

const ADMIN_SESSION_KEY = "gkn_admin_session_v2";
const APP_TIME_ZONE = "Asia/Makassar";

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const state = { token: "", admin: null, employees: [], attendance: [], requests: [], admins: [], office: null, currentRows: [] };

function icons() { if (window.lucide) window.lucide.createIcons(); }
function esc(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function localDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
function localMonthKey(date = new Date()) { return localDateKey(date).slice(0, 7); }
function formatDate(value, options = {}) {
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00+08:00`) : new Date(value);
  return new Intl.DateTimeFormat("id-ID", { timeZone: APP_TIME_ZONE, day: "2-digit", month: "short", year: "numeric", ...options }).format(date);
}
function formatTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)).replace(".", ":");
}
function showToast(title, message = "", type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i data-lucide="${type === "error" ? "circle-x" : "circle-check"}"></i><div><strong>${esc(title)}</strong>${message ? `<span>${esc(message)}</span>` : ""}</div>`;
  $("#toastRegion").appendChild(toast);
  icons();
  setTimeout(() => toast.remove(), 4500);
}
function errorMessage(error) {
  const known = { "Failed to fetch": "Tidak dapat terhubung ke Supabase. Periksa internet dan konfigurasi." };
  return known[error?.message] || error?.message || "Terjadi kesalahan.";
}
function setLoading(button, loading, label = "Memproses...") {
  if (!button) return;
  if (loading) {
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<i class="is-spinning" data-lucide="loader-circle"></i><span>${esc(label)}</span>`;
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.originalHtml || button.innerHTML;
  }
  icons();
}
function statusClass(status) {
  if (["Hadir", "Lembur", "approved", "aktif"].includes(status)) return "status-present";
  if (["Terlambat", "Pulang Cepat", "Terlambat dan Pulang Cepat", "pending"].includes(status)) return "status-late";
  if (["rejected", "nonaktif"].includes(status)) return "status-inactive";
  return "status-neutral";
}
function badge(label, cls) { return `<span class="status-badge ${cls}">${esc(label)}</span>`; }
function roleAllows(element) {
  const roles = element.dataset.roles;
  return !roles || roles.split(",").includes(state.admin.role);
}
function showAccessDenied() {
  $("#accessDenied").classList.remove("hidden");
  setTimeout(() => $("#accessDenied").classList.add("hidden"), 3800);
}
function withDemo(path) { return `${path}${isDemoMode ? "?demo=1" : ""}`; }
function session() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(ADMIN_SESSION_KEY));
    if (!saved?.token || (saved.expires_at && new Date(saved.expires_at) <= new Date())) return null;
    return saved;
  } catch { return null; }
}
function saveSession(result) {
  const saved = { token: result.session_token, admin: result.admin, expires_at: result.expires_at };
  sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(saved));
  return saved;
}
function setupPasswordToggles() {
  $$(".password-toggle").forEach((button) => button.addEventListener("click", () => {
    const input = button.parentElement.querySelector("input");
    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    button.innerHTML = `<i data-lucide="${reveal ? "eye-off" : "eye"}"></i>`;
    icons();
  }));
}
function fillBagianSelect(select, includeEmpty = false) {
  const values = includeEmpty ? ["", ...BAGIAN_VALUES] : BAGIAN_VALUES;
  select.innerHTML = values.map((value) => `<option value="${esc(value)}">${esc(value || "Semua")}</option>`).join("");
}
function fillAdminBagianSelect(select) {
  select.innerHTML = ADMIN_BAGIAN_VALUES.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join("");
}
function applyRoleVisibility() {
  $$("[data-roles]").forEach((element) => element.classList.toggle("hidden", !roleAllows(element)));
  $$("[data-section-filter]").forEach((select) => {
    if (state.admin.role === "admin_bagian") {
      select.value = state.admin.bagian;
      select.disabled = true;
    } else {
      select.disabled = false;
    }
  });
}
function openModal(modal) { modal.classList.remove("hidden"); document.body.classList.add("modal-open"); }
function closeModal(modal) { modal.classList.add("hidden"); if (!document.querySelector(".modal:not(.hidden)")) document.body.classList.remove("modal-open"); }

function reportRange(mode) {
  if (mode === "today") return { start: localDateKey(), end: localDateKey() };
  if (mode === "daily") {
    const date = $("#dailyDate")?.value || localDateKey();
    return { start: date, end: date };
  }
  if (mode === "monthly") {
    const month = $("#monthlyMonth")?.value || localMonthKey();
    const [year, number] = month.split("-").map(Number);
    const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
    return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
  }
  return { start: $("#historyStart")?.value || `${localMonthKey()}-01`, end: $("#historyEnd")?.value || localDateKey() };
}
function minutes(record) {
  if (!record.check_in_time || !record.check_out_time) return 0;
  return Math.max(0, Math.floor((new Date(record.check_out_time) - new Date(record.check_in_time)) / 60000));
}
function formatMinutes(value) { return `${Math.floor(value / 60)} jam ${value % 60} menit`; }

async function bootstrapDashboard(saved) {
  state.token = saved.token;
  state.admin = await api.adminGetProfile(state.token);
  $("#adminLoginView").classList.add("hidden");
  $("#adminDashboard").classList.remove("hidden");
  $("#adminNameLabel").textContent = state.admin.nama;
  $("#adminRoleLabel").textContent = `${ROLE_LABELS[state.admin.role]} - ${state.admin.bagian}`;
  $("#welcomeAdmin").textContent = `Selamat datang, ${state.admin.nama}`;
  $("#adminScope").textContent = state.admin.role === "admin_bagian" ? `Cakupan data: ${state.admin.bagian}` : "Cakupan data: Semua bagian";
  $("#adminRoleBadge").textContent = ROLE_LABELS[state.admin.role];
  $("#employeeScopeText").textContent = state.admin.role === "admin_bagian" ? `Hanya data ${state.admin.bagian}.` : "Semua bagian sesuai hak akses.";
  applyRoleVisibility();
  await loadBaseData();
}
async function loadBaseData() {
  const today = localDateKey();
  const [employees, attendance, requests, office] = await Promise.all([
    api.listEmployees(state.token),
    api.listAttendance(state.token, today, today),
    api.listRequests(state.token),
    api.adminGetOfficeLocation(state.token)
  ]);
  state.employees = employees;
  state.attendance = attendance;
  state.requests = requests;
  state.office = office;
  renderDashboard();
  renderEmployees();
}
function renderDashboard() {
  $("#statEmployees").textContent = state.employees.filter((item) => item.is_active).length;
  $("#statPresent").textContent = state.attendance.length;
  $("#statPending").textContent = state.requests.filter((item) => item.status === "pending").length;
  $("#statRadius").textContent = state.office?.radius_meter ? `${state.office.radius_meter} m` : "-";
}

function renderEmployees() {
  const query = ($("#employeeSearch")?.value || "").toLowerCase();
  const bagian = $("#employeeBagianFilter")?.value || "";
  const status = $("#employeeStatusFilter")?.value || "";
  const rows = state.employees.filter((item) =>
    (!query || item.name.toLowerCase().includes(query)) &&
    (!bagian || item.bagian === bagian) &&
    (!status || (status === "aktif" ? item.is_active : !item.is_active))
  );
  $("#employeesEmpty").classList.toggle("hidden", rows.length > 0);
  $("#employeesBody").innerHTML = rows.map((item) => `
    <tr>
      <td><span class="cell-primary">${esc(item.name)}</span><span class="cell-secondary">${esc(item.bio || "-")}</span></td>
      <td>${esc(item.bagian)}</td>
      <td>${esc(item.shift || "-")}</td>
      <td>${esc(item.phone || "-")}</td>
      <td>${item.photo_url ? `<button class="photo-thumb" data-photo="${esc(item.photo_url)}"><img src="${esc(item.photo_url)}" alt=""></button>` : "-"}</td>
      <td>${badge(item.is_active ? "Aktif" : "Nonaktif", statusClass(item.is_active ? "aktif" : "nonaktif"))}</td>
      <td class="align-right">${state.admin.role === "super_admin" ? `<div class="cell-action-group"><button class="icon-button" data-edit-employee="${esc(item.id)}"><i data-lucide="pencil"></i></button><button class="icon-button" data-toggle-employee="${esc(item.id)}"><i data-lucide="${item.is_active ? "user-x" : "user-check"}"></i></button><button class="icon-button danger-action" data-delete-employee="${esc(item.id)}"><i data-lucide="trash-2"></i></button></div>` : `<span class="cell-secondary">Lihat saja</span>`}</td>
    </tr>
  `).join("");
  icons();
}

function renderReportSection(section, mode) {
  const title = mode === "today" ? "Absensi Hari Ini" : mode === "history" ? "Riwayat Absensi" : mode === "daily" ? "Laporan Harian" : "Laporan Bulanan";
  const filterHtml = mode === "monthly"
    ? `<label class="field"><span>Bulan</span><input id="monthlyMonth" type="month" value="${localMonthKey()}"></label><label class="field"><span>Bagian</span><select id="monthlyBagian" data-section-filter><option value="">Semua</option></select></label>`
    : mode === "history"
      ? `<label class="field"><span>Mulai</span><input id="historyStart" type="date" value="${localMonthKey()}-01"></label><label class="field"><span>Selesai</span><input id="historyEnd" type="date" value="${localDateKey()}"></label><label class="field"><span>Bagian</span><select id="historyBagian" data-section-filter><option value="">Semua</option></select></label>`
      : mode === "daily"
        ? `<label class="field"><span>Tanggal</span><input id="dailyDate" type="date" value="${localDateKey()}"></label><label class="field"><span>Bagian</span><select id="dailyBagian" data-section-filter><option value="">Semua</option></select></label>`
        : `<label class="field"><span>Bagian</span><select id="todayBagian" data-section-filter><option value="">Semua</option></select></label>`;
  section.innerHTML = `
    <section class="data-section">
      <div class="table-meta"><div><h2>${title}</h2><p>Data difilter sesuai role dan bagian admin.</p></div><button class="icon-button" data-refresh-report="${mode}"><i data-lucide="refresh-cw"></i></button></div>
      <div class="filters-grid">${filterHtml}<label class="field"><span>Cari nama</span><input id="${mode}Search" type="search"></label></div>
      <div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Pegawai</th><th>Bagian</th><th>Masuk</th><th>Pulang</th><th>Status</th><th>GPS</th><th>Selfie</th></tr></thead><tbody id="${mode}ReportBody"></tbody></table><div id="${mode}ReportEmpty" class="empty-state hidden"><i data-lucide="inbox"></i><strong>Data tidak ditemukan</strong></div></div>
    </section>
  `;
  section.querySelectorAll("select[data-section-filter]").forEach((select) => fillBagianSelect(select, true));
  applyRoleVisibility();
  section.querySelectorAll("input,select").forEach((input) => input.addEventListener("input", () => loadReport(mode)));
  section.querySelector("[data-refresh-report]").addEventListener("click", () => loadReport(mode));
}
async function loadReport(mode) {
  const section = document.querySelector(`.report-view[data-mode="${mode}"]`);
  if (!section.innerHTML.trim()) renderReportSection(section, mode);
  const { start, end } = reportRange(mode);
  const rows = await api.listAttendance(state.token, start, end);
  const query = ($(`#${mode}Search`)?.value || "").toLowerCase();
  const bagian = $(`#${mode}Bagian`)?.value || "";
  const filtered = rows.filter((row) => (!query || row.guard_name.toLowerCase().includes(query)) && (!bagian || row.bagian === bagian));
  state.currentRows = filtered;
  $(`#${mode}ReportEmpty`).classList.toggle("hidden", filtered.length > 0);
  $(`#${mode}ReportBody`).innerHTML = filtered.map((row) => `
    <tr>
      <td>${esc(formatDate(row.date))}</td>
      <td><span class="cell-primary">${esc(row.guard_name)}</span><span class="cell-secondary">${esc(row.shift || "-")}</span></td>
      <td>${esc(row.bagian)}</td>
      <td>${row.check_in_time ? `${formatTime(row.check_in_time)} WITA` : "-"}</td>
      <td>${row.check_out_time ? `${formatTime(row.check_out_time)} WITA` : "-"}</td>
      <td>${badge(row.status || "-", statusClass(row.status))}</td>
      <td>${row.check_in_latitude ? `<a class="map-link" target="_blank" href="https://www.google.com/maps?q=${row.check_in_latitude},${row.check_in_longitude}">Masuk</a>` : "-"} ${row.check_out_latitude ? `<a class="map-link" target="_blank" href="https://www.google.com/maps?q=${row.check_out_latitude},${row.check_out_longitude}">Pulang</a>` : ""}</td>
      <td>${row.check_in_selfie_url ? `<button class="photo-thumb" data-photo="${esc(row.check_in_selfie_url)}"><img src="${esc(row.check_in_selfie_url)}" alt=""></button>` : "-"} ${row.check_out_selfie_url ? `<button class="photo-thumb" data-photo="${esc(row.check_out_selfie_url)}"><img src="${esc(row.check_out_selfie_url)}" alt=""></button>` : ""}</td>
    </tr>
  `).join("");
  icons();
}

async function loadRequestView(kind) {
  const section = document.querySelector(`.request-view[data-kind="${kind}"]`);
  const rows = await api.listRequests(state.token, kind);
  state.requests = rows;
  section.innerHTML = `
    <section class="data-section">
      <div class="table-meta"><div><h2>Pengajuan ${REQUEST_LABELS[kind]}</h2><p>${rows.length} data pengajuan.</p></div><button class="icon-button" data-refresh-request="${kind}"><i data-lucide="refresh-cw"></i></button></div>
      <div class="table-wrap"><table><thead><tr><th>Pegawai</th><th>Bagian</th><th>Periode</th><th>Alasan</th><th>Status</th><th class="align-right">Keputusan</th></tr></thead><tbody>${rows.map((row) => `
        <tr>
          <td><span class="cell-primary">${esc(row.guard_name)}</span><span class="cell-secondary">${esc(formatDate(row.created_at))}</span></td>
          <td>${esc(row.bagian)}</td>
          <td>${esc(formatDate(row.tanggal_mulai))}${row.tanggal_selesai !== row.tanggal_mulai ? `<span class="cell-secondary">s.d. ${esc(formatDate(row.tanggal_selesai))}</span>` : ""}</td>
          <td>${esc(row.alasan)}${row.bukti_url ? `<span class="cell-secondary"><a href="${esc(row.bukti_url)}" target="_blank">Lihat bukti</a></span>` : ""}${row.catatan_admin ? `<span class="cell-secondary">Catatan: ${esc(row.catatan_admin)}</span>` : ""}</td>
          <td>${badge(REQUEST_STATUS_LABELS[row.status] || row.status, statusClass(row.status))}</td>
          <td class="align-right">${row.status === "pending" ? `<div class="decision-actions"><button class="button button-small button-approve" data-decide="${esc(row.id)}" data-status="approved" data-kind="${kind}">Setujui</button><button class="button button-small button-reject" data-decide="${esc(row.id)}" data-status="rejected" data-kind="${kind}">Tolak</button></div>` : "-"}</td>
        </tr>`).join("")}</tbody></table><div class="empty-state ${rows.length ? "hidden" : ""}"><i data-lucide="inbox"></i><strong>Belum ada pengajuan</strong></div></div>
    </section>
  `;
  section.querySelector("[data-refresh-request]").addEventListener("click", () => loadRequestView(kind));
  icons();
}

async function loadAdmins() {
  if (state.admin.role !== "super_admin") return showAccessDenied();
  state.admins = await api.listAdmins(state.token);
  $("#adminsEmpty").classList.toggle("hidden", state.admins.length > 0);
  $("#adminsBody").innerHTML = state.admins.map((item) => `
    <tr>
      <td><span class="cell-primary">${esc(item.nama)}</span></td>
      <td>${esc(item.username)}</td>
      <td><span class="role-pill role-${esc(item.role)}">${esc(ROLE_LABELS[item.role])}</span></td>
      <td>${esc(item.bagian)}</td>
      <td>${badge(item.status === "aktif" ? "Aktif" : "Nonaktif", statusClass(item.status))}</td>
      <td class="align-right"><div class="cell-action-group"><button class="icon-button" data-edit-admin="${esc(item.id)}"><i data-lucide="pencil"></i></button><button class="icon-button" data-toggle-admin="${esc(item.id)}"><i data-lucide="${item.status === "aktif" ? "user-x" : "user-check"}"></i></button><button class="icon-button danger-action" data-delete-admin="${esc(item.id)}"><i data-lucide="trash-2"></i></button></div></td>
    </tr>
  `).join("");
  icons();
}
async function loadLocation() {
  if (state.admin.role !== "super_admin") return showAccessDenied();
  state.office = await api.adminGetOfficeLocation(state.token);
  $("#officeName").value = state.office?.nama_lokasi || "GKN Mamuju";
  $("#officeLatitude").value = state.office?.latitude || "";
  $("#officeLongitude").value = state.office?.longitude || "";
  $("#officeRadius").value = state.office?.radius_meter || 150;
}
async function switchView(button) {
  if (!roleAllows(button)) return showAccessDenied();
  const id = button.dataset.view;
  $$(".admin-view").forEach((view) => view.classList.toggle("hidden", view.id !== id));
  $$("[data-view]").forEach((item) => item.classList.toggle("active", item === button));
  $("#adminPageTitle").textContent = button.dataset.title;
  $("#adminDashboard").classList.remove("sidebar-open");
  try {
    if (["todayView", "historyView", "dailyReportView", "monthlyReportView"].includes(id)) await loadReport(document.querySelector(`#${id}`).dataset.mode);
    if (["izinView", "sakitView", "cutiView", "lemburView"].includes(id)) await loadRequestView(document.querySelector(`#${id}`).dataset.kind);
    if (id === "adminsView") await loadAdmins();
    if (id === "locationView") await loadLocation();
  } catch (error) {
    showToast("Data gagal dimuat", errorMessage(error), "error");
  }
}
function openEmployeeForm(row = null) {
  if (state.admin.role !== "super_admin") return showAccessDenied();
  $("#employeeForm").reset();
  $("#employeeEditId").value = row?.id || "";
  $("#employeeModalTitle").textContent = row ? "Edit Pegawai" : "Tambah Pegawai";
  $("#employeeFormName").value = row?.name || "";
  $("#employeeFormBagian").value = row?.bagian || "Satpam";
  $("#employeeFormShift").value = row?.shift || "Reguler";
  $("#employeeFormPhone").value = row?.phone || "";
  $("#employeeFormBio").value = row?.bio || "";
  $("#employeeFormActive").checked = row ? row.is_active : true;
  $("#employeeFormPin").required = !row;
  $("#employeePinHint").textContent = row ? "(kosongkan jika tidak diubah)" : "(default boleh 1234)";
  openModal($("#employeeModal"));
}
function syncAdminBagian() {
  const role = $("#adminFormRole").value;
  $("#adminFormBagian").disabled = role !== "admin_bagian";
  if (role !== "admin_bagian") $("#adminFormBagian").value = "Semua";
  if (role === "admin_bagian" && $("#adminFormBagian").value === "Semua") $("#adminFormBagian").value = "Satpam";
}
function openAdminForm(row = null) {
  if (state.admin.role !== "super_admin") return showAccessDenied();
  $("#adminForm").reset();
  $("#adminEditId").value = row?.id || "";
  $("#adminModalTitle").textContent = row ? "Edit Admin" : "Tambah Admin";
  $("#adminFormName").value = row?.nama || "";
  $("#adminFormUsername").value = row?.username || "";
  $("#adminFormRole").value = row?.role || "admin_bagian";
  $("#adminFormBagian").value = row?.bagian || "Satpam";
  $("#adminFormStatus").value = row?.status || "aktif";
  $("#adminFormPassword").required = !row;
  $("#adminPasswordHint").textContent = row ? "(kosongkan jika tidak diubah)" : "(minimal 6 karakter)";
  syncAdminBagian();
  openModal($("#adminModal"));
}
function exportRows(rows) {
  return rows.map((row) => ({
    Tanggal: row.date,
    Nama: row.guard_name,
    Bagian: row.bagian,
    Shift: row.shift || "",
    "Jam Masuk": row.check_in_time ? `${formatTime(row.check_in_time)} WITA` : "",
    "Jam Pulang": row.check_out_time ? `${formatTime(row.check_out_time)} WITA` : "",
    "Durasi": row.work_duration || "",
    Status: row.status || "",
    "Catatan Masuk": row.check_in_note || "",
    "Catatan Pulang": row.check_out_note || "",
    Lembur: row.is_overtime ? "Ya" : "Tidak",
    "Catatan Lembur": row.overtime_note || "",
    "Maps Masuk": row.check_in_latitude ? `https://www.google.com/maps?q=${row.check_in_latitude},${row.check_in_longitude}` : "",
    "Maps Pulang": row.check_out_latitude ? `https://www.google.com/maps?q=${row.check_out_latitude},${row.check_out_longitude}` : ""
  }));
}
async function exportAttendance(format) {
  const start = $("#exportStart").value;
  const end = $("#exportEnd").value;
  if (!start || !end || end < start) return showToast("Periode tidak valid", "Pilih tanggal mulai dan selesai dengan benar.", "error");
  const bagian = $("#exportBagian").value;
  const rows = (await api.listAttendance(state.token, start, end)).filter((row) => !bagian || row.bagian === bagian);
  const data = exportRows(rows);
  if (!data.length) return showToast("Tidak ada data", "Tidak ada data untuk diexport.", "error");
  const filename = `absensi-gkn-${start}-${end}`;
  if (format === "xlsx") {
    if (!window.XLSX) return showToast("Excel belum siap", "Pustaka XLSX gagal dimuat.", "error");
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(data), "Absensi GKN");
    window.XLSX.writeFile(wb, `${filename}.xlsx`);
  } else {
    const headers = Object.keys(data[0]);
    const cell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [headers.map(cell).join(","), ...data.map((row) => headers.map((key) => cell(row[key])).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${filename}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  showToast("Export berhasil", `${data.length} baris data diunduh.`);
}

async function init() {
  icons();
  setupPasswordToggles();
  if (!isConfigured && !isDemoMode) $("#configNotice").classList.remove("hidden");
  $("#adminToday").textContent = formatDate(new Date(), { weekday: "long", month: "long" });
  ["employeeBagianFilter", "exportBagian"].forEach((id) => fillBagianSelect($(`#${id}`), true));
  fillBagianSelect($("#employeeFormBagian"));
  fillAdminBagianSelect($("#adminFormBagian"));
  $("#exportStart").value = `${localMonthKey()}-01`;
  $("#exportEnd").value = localDateKey();

  $("#adminLoginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    setLoading(button, true, "Memeriksa akun...");
    try {
      const result = await api.adminLogin($("#adminUsername").value.trim(), $("#adminPassword").value);
      await bootstrapDashboard(saveSession(result));
      showToast("Login berhasil", `Selamat datang, ${result.admin.nama}.`);
    } catch (error) {
      showToast("Login admin gagal", errorMessage(error), "error");
      setLoading(button, false);
    }
  });
  $("#adminLogout").addEventListener("click", async () => {
    try { await api.adminLogout(state.token); } finally { sessionStorage.removeItem(ADMIN_SESSION_KEY); location.replace(withDemo("admin.html")); }
  });
  $("#sidebarToggle").addEventListener("click", () => $("#adminDashboard").classList.toggle("sidebar-open"));
  $$("[data-view]").forEach((button) => button.addEventListener("click", () => switchView(button)));

  ["employeeSearch", "employeeBagianFilter", "employeeStatusFilter"].forEach((id) => $(`#${id}`).addEventListener("input", renderEmployees));
  $("#addEmployeeButton").addEventListener("click", () => openEmployeeForm());
  $$("[data-close-employee-modal]").forEach((element) => element.addEventListener("click", () => closeModal($("#employeeModal"))));
  $("#employeeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    const payload = {
      id: $("#employeeEditId").value || null,
      name: $("#employeeFormName").value.trim(),
      pin: $("#employeeFormPin").value.trim(),
      bagian: $("#employeeFormBagian").value,
      shift: $("#employeeFormShift").value,
      phone: $("#employeeFormPhone").value.trim(),
      bio: $("#employeeFormBio").value.trim(),
      photo_url: "",
      is_active: $("#employeeFormActive").checked
    };
    setLoading(button, true, "Menyimpan...");
    try {
      await api.saveEmployee(state.token, payload);
      closeModal($("#employeeModal"));
      state.employees = await api.listEmployees(state.token);
      renderEmployees(); renderDashboard();
      showToast("Data pegawai tersimpan");
    } catch (error) { showToast("Data pegawai gagal disimpan", errorMessage(error), "error"); }
    finally { setLoading(button, false); }
  });
  $("#employeesBody").addEventListener("click", async (event) => {
    const edit = event.target.closest("[data-edit-employee]");
    const toggle = event.target.closest("[data-toggle-employee]");
    const del = event.target.closest("[data-delete-employee]");
    const photo = event.target.closest("[data-photo]");
    if (photo) { $("#photoModalImage").src = photo.dataset.photo; return openModal($("#photoModal")); }
    if (edit) return openEmployeeForm(state.employees.find((item) => item.id === edit.dataset.editEmployee));
    if (toggle) {
      const row = state.employees.find((item) => item.id === toggle.dataset.toggleEmployee);
      if (!row || !confirm(`${row.is_active ? "Nonaktifkan" : "Aktifkan"} ${row.name}?`)) return;
      await api.saveEmployee(state.token, { ...row, pin: "", is_active: !row.is_active });
      state.employees = await api.listEmployees(state.token); renderEmployees(); renderDashboard();
    }
    if (del) {
      const row = state.employees.find((item) => item.id === del.dataset.deleteEmployee);
      if (!row || !confirm(`Hapus pegawai ${row.name}?`)) return;
      await api.deleteEmployee(state.token, row.id);
      state.employees = await api.listEmployees(state.token); renderEmployees(); renderDashboard();
    }
  });

  document.addEventListener("click", async (event) => {
    const decision = event.target.closest("[data-decide]");
    const photo = event.target.closest("[data-photo]");
    if (photo) { $("#photoModalImage").src = photo.dataset.photo; return openModal($("#photoModal")); }
    if (!decision) return;
    const note = prompt("Catatan admin (opsional):", "") ?? "";
    try {
      await api.decideRequest(state.token, decision.dataset.decide, decision.dataset.status, note);
      await loadRequestView(decision.dataset.kind);
      state.requests = await api.listRequests(state.token);
      renderDashboard();
      showToast("Pengajuan diperbarui", REQUEST_STATUS_LABELS[decision.dataset.status]);
    } catch (error) { showToast("Keputusan gagal", errorMessage(error), "error"); }
  });

  $("#addAdminButton").addEventListener("click", () => openAdminForm());
  $("#adminFormRole").addEventListener("change", syncAdminBagian);
  $$("[data-close-admin-modal]").forEach((element) => element.addEventListener("click", () => closeModal($("#adminModal"))));
  $("#adminForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    const payload = {
      id: $("#adminEditId").value || null,
      nama: $("#adminFormName").value.trim(),
      username: $("#adminFormUsername").value.trim(),
      password: $("#adminFormPassword").value,
      role: $("#adminFormRole").value,
      bagian: $("#adminFormBagian").value,
      status: $("#adminFormStatus").value
    };
    setLoading(button, true, "Menyimpan...");
    try {
      await api.saveAdmin(state.token, payload);
      closeModal($("#adminModal"));
      await loadAdmins();
      showToast("Data admin tersimpan");
    } catch (error) { showToast("Data admin gagal disimpan", errorMessage(error), "error"); }
    finally { setLoading(button, false); }
  });
  $("#adminsBody").addEventListener("click", async (event) => {
    const edit = event.target.closest("[data-edit-admin]");
    const toggle = event.target.closest("[data-toggle-admin]");
    const del = event.target.closest("[data-delete-admin]");
    if (edit) return openAdminForm(state.admins.find((item) => item.id === edit.dataset.editAdmin));
    if (toggle) {
      const row = state.admins.find((item) => item.id === toggle.dataset.toggleAdmin);
      if (!row || !confirm(`${row.status === "aktif" ? "Nonaktifkan" : "Aktifkan"} ${row.nama}?`)) return;
      await api.saveAdmin(state.token, { ...row, password: "", status: row.status === "aktif" ? "nonaktif" : "aktif" });
      await loadAdmins();
    }
    if (del) {
      const row = state.admins.find((item) => item.id === del.dataset.deleteAdmin);
      if (!row || !confirm(`Hapus admin ${row.nama}?`)) return;
      await api.deleteAdmin(state.token, row.id);
      await loadAdmins();
    }
  });
  $("#locationForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    setLoading(button, true, "Menyimpan...");
    try {
      await api.adminSaveOfficeLocation(state.token, {
        nama_lokasi: $("#officeName").value.trim(),
        latitude: $("#officeLatitude").value,
        longitude: $("#officeLongitude").value,
        radius_meter: $("#officeRadius").value
      });
      state.office = await api.adminGetOfficeLocation(state.token);
      renderDashboard();
      showToast("Lokasi absen tersimpan");
    } catch (error) { showToast("Lokasi gagal disimpan", errorMessage(error), "error"); }
    finally { setLoading(button, false); }
  });
  $("#exportExcel").addEventListener("click", () => exportAttendance("xlsx"));
  $("#exportCsv").addEventListener("click", () => exportAttendance("csv"));
  $$("[data-close-photo-modal]").forEach((element) => element.addEventListener("click", () => closeModal($("#photoModal"))));

  const saved = session();
  if (saved) {
    try { await bootstrapDashboard(saved); } catch { sessionStorage.removeItem(ADMIN_SESSION_KEY); }
  }
}

document.addEventListener("DOMContentLoaded", init);
