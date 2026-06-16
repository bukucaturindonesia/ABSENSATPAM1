import { api, isConfigured, isDemoMode, REQUEST_LABELS, REQUEST_STATUS_LABELS } from "./supabase.js";

const EMPLOYEE_SESSION_KEY = "gkn_employee_session_v2";
const APP_TIME_ZONE = "Asia/Makassar";
const page = document.body.dataset.page;

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

function icons() { if (window.lucide) window.lucide.createIcons(); }
function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function localDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
function formatDate(value, options = {}) {
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00+08:00`) : new Date(value);
  return new Intl.DateTimeFormat("id-ID", { timeZone: APP_TIME_ZONE, day: "2-digit", month: "short", year: "numeric", ...options }).format(date);
}
function formatTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)).replace(".", ":");
}
function showToast(title, message = "", type = "success") {
  const region = $("#toastRegion");
  if (!region) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i data-lucide="${type === "error" ? "circle-x" : "circle-check"}"></i><div><strong>${esc(title)}</strong>${message ? `<span>${esc(message)}</span>` : ""}</div>`;
  region.appendChild(toast);
  icons();
  setTimeout(() => toast.remove(), 4500);
}
function errorMessage(error) {
  const known = {
    "Failed to fetch": "Tidak dapat terhubung ke Supabase. Periksa internet dan konfigurasi.",
    "new row violates row-level security policy": "Akses ditolak oleh kebijakan Supabase."
  };
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
function withDemo(path) { return `${path}${isDemoMode ? "?demo=1" : ""}`; }
function updateConfigNotice() { if (!isConfigured && !isDemoMode) $("#configNotice")?.classList.remove("hidden"); }
function employeeSession() {
  try { return JSON.parse(sessionStorage.getItem(EMPLOYEE_SESSION_KEY)); } catch { return null; }
}
function saveEmployeeSession(session) { sessionStorage.setItem(EMPLOYEE_SESSION_KEY, JSON.stringify(session)); }
function statusClass(status) {
  if (["Hadir", "Lembur", "approved"].includes(status)) return "status-present";
  if (["Terlambat", "Pulang Cepat", "Terlambat dan Pulang Cepat", "pending"].includes(status)) return "status-late";
  if (["rejected"].includes(status)) return "status-inactive";
  return "status-neutral";
}
function attendanceDisplay(record) {
  if (!record) return ["Belum Absen", "status-neutral"];
  if (record.check_out_time) return [record.status || "Pulang", statusClass(record.status)];
  return [record.status || "Hadir", statusClass(record.status)];
}
function setupPasswordToggles() {
  $$(".password-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const input = button.parentElement.querySelector("input");
      const reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      button.innerHTML = `<i data-lucide="${reveal ? "eye-off" : "eye"}"></i>`;
      icons();
    });
  });
}
function preserveDemoNavigation() {
  if (!isDemoMode) return;
  $$("a[href$='.html']").forEach((link) => {
    const url = new URL(link.href);
    url.searchParams.set("demo", "1");
    link.href = url.href;
  });
}
function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("GPS tidak didukung browser ini."));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: Number(pos.coords.latitude.toFixed(8)), longitude: Number(pos.coords.longitude.toFixed(8)), accuracy: Math.round(pos.coords.accuracy) }),
      () => reject(new Error("GPS belum aktif. Izinkan akses lokasi lalu coba lagi.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}
function fileOf(id) { return $(`#${id}`)?.files?.[0] || null; }

function initHome() { preserveDemoNavigation(); }

function initEmployeeLogin() {
  preserveDemoNavigation();
  updateConfigNotice();
  setupPasswordToggles();
  if (employeeSession()?.employee?.id) return location.replace(withDemo("absen.html"));
  $("#employeeLoginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type='submit']");
    setLoading(button, true, "Memeriksa akun...");
    try {
      const employee = await api.loginGuard($("#employeeName").value.trim(), $("#employeePin").value);
      saveEmployeeSession({ employee, pin: $("#employeePin").value });
      showToast("Login berhasil", `Selamat datang, ${employee.name}.`);
      setTimeout(() => location.assign(withDemo("absen.html")), 350);
    } catch (error) {
      showToast("Login gagal", errorMessage(error), "error");
      setLoading(button, false);
    }
  });
}

async function initEmployeeDashboard() {
  preserveDemoNavigation();
  updateConfigNotice();
  const session = employeeSession();
  if (!session?.employee?.id || !session?.pin) return location.replace(withDemo("login.html"));
  let employee = session.employee;
  let todayAttendance = null;

  function renderProfile() {
    $("#welcomeName").textContent = `Halo, ${employee.name}`;
    $("#employeeMeta").textContent = `${employee.bagian} • Shift ${employee.shift || "-"}`;
    $("#employeeBio").value = employee.bio || "";
    $("#profilePhoto").src = employee.photo_url || `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" rx="24" fill="#e8f4fb"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="38" fill="#1479b8">${employee.name.slice(0,1).toUpperCase()}</text></svg>`)}`;
  }
  function renderToday() {
    const [label, cls] = attendanceDisplay(todayAttendance);
    $("#attendanceBadge").className = `status-badge ${cls}`;
    $("#attendanceBadge").textContent = label;
    $("#checkInValue").textContent = todayAttendance?.check_in_time ? `${formatTime(todayAttendance.check_in_time)} WITA - ${todayAttendance.status}` : "Belum tercatat";
    $("#checkOutValue").textContent = todayAttendance?.check_out_time ? `${formatTime(todayAttendance.check_out_time)} WITA - ${todayAttendance.work_duration || ""}` : "Belum tercatat";
    $("#checkInButton").disabled = Boolean(todayAttendance?.check_in_time);
    $("#checkOutButton").disabled = !todayAttendance?.check_in_time || Boolean(todayAttendance?.check_out_time);
  }
  async function loadToday() {
    todayAttendance = await api.getDailyAttendance(employee.id, session.pin, localDateKey());
    renderToday();
  }
  async function loadHistory() {
    const rows = await api.listEmployeeAttendance(employee.id, session.pin);
    $("#attendanceHistoryEmpty").classList.toggle("hidden", rows.length > 0);
    $("#attendanceHistoryBody").innerHTML = rows.map((row) => `
      <tr>
        <td>${esc(formatDate(row.date))}</td>
        <td>${row.check_in_time ? `${formatTime(row.check_in_time)} WITA` : "-"}</td>
        <td>${row.check_out_time ? `${formatTime(row.check_out_time)} WITA` : "-"}</td>
        <td><span class="status-badge ${statusClass(row.status)}">${esc(row.status || "-")}</span></td>
        <td><span class="cell-secondary">${esc([row.check_in_note, row.check_out_note, row.overtime_note].filter(Boolean).join(" | ") || "-")}</span></td>
      </tr>
    `).join("");
  }
  async function loadRequests() {
    const rows = await api.listEmployeeRequests(employee.id, session.pin);
    $("#requestEmpty").classList.toggle("hidden", rows.length > 0);
    $("#requestList").innerHTML = rows.map((row) => `
      <article class="request-list-item">
        <span class="request-list-icon"><i data-lucide="${row.jenis === "sakit" ? "heart-pulse" : row.jenis === "cuti" ? "calendar-range" : row.jenis === "lembur" ? "moon-star" : "file-clock"}"></i></span>
        <div class="request-list-copy">
          <div><strong>${esc(REQUEST_LABELS[row.jenis] || row.jenis)}</strong><span class="status-badge ${statusClass(row.status)}">${esc(REQUEST_STATUS_LABELS[row.status] || row.status)}</span></div>
          <p>${esc(formatDate(row.tanggal_mulai))}${row.tanggal_selesai !== row.tanggal_mulai ? ` s.d. ${esc(formatDate(row.tanggal_selesai))}` : ""}</p>
          <span>${esc(row.alasan)}</span>
          ${row.catatan_admin ? `<small>Catatan admin: ${esc(row.catatan_admin)}</small>` : ""}
        </div>
      </article>
    `).join("");
    icons();
  }
  async function loadOffice() {
    try {
      const office = await api.getOfficeLocation();
      $("#officeLocationInfo").innerHTML = `<i data-lucide="map-pin"></i><p>Lokasi default: <strong>${esc(office?.nama_lokasi || "-")}</strong>, radius <strong>${esc(office?.radius_meter || "-")} meter</strong>. Jika di luar radius, sistem memberi peringatan dan lokasi tetap disimpan.</p>`;
      icons();
    } catch {
      $("#officeLocationInfo").innerHTML = `<i data-lucide="map-pin"></i><p>Lokasi default belum tersedia.</p>`;
    }
  }

  $("#liveDate").textContent = new Intl.DateTimeFormat("id-ID", { timeZone: APP_TIME_ZONE, weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date());
  setInterval(() => {
    $("#liveClock").textContent = new Intl.DateTimeFormat("id-ID", { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date()).replaceAll(".", ":");
  }, 1000);
  $("#todayTitle").textContent = formatDate(localDateKey(), { month: "long" });
  $("#requestStart").value = localDateKey();
  $("#requestEnd").value = localDateKey();

  $("#employeeLogout").addEventListener("click", () => {
    sessionStorage.removeItem(EMPLOYEE_SESSION_KEY);
    location.assign(withDemo("login.html"));
  });
  $("#checkInForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $("#checkInButton");
    const file = fileOf("checkInSelfie");
    if (!file) return showToast("Selfie wajib", "Ambil foto selfie masuk terlebih dahulu.", "error");
    setLoading(button, true, "Mengambil GPS...");
    try {
      const position = await getLocation();
      setLoading(button, true, "Mengirim absen...");
      const selfieUrl = await api.uploadSelfie(file, employee.id, "masuk");
      todayAttendance = await api.checkIn({
        guardId: employee.id,
        pin: session.pin,
        date: localDateKey(),
        checkInTime: new Date().toISOString(),
        latitude: position.latitude,
        longitude: position.longitude,
        selfieUrl,
        note: $("#checkInNote").value.trim()
      });
      form.reset();
      renderToday();
      await loadHistory();
      showToast("Absen masuk berhasil", todayAttendance.check_in_note || `Akurasi GPS sekitar ${position.accuracy} m.`);
    } catch (error) {
      showToast("Absen masuk gagal", errorMessage(error), "error");
    } finally {
      setLoading(button, false);
      renderToday();
    }
  });
  $("#checkOutForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $("#checkOutButton");
    const file = fileOf("checkOutSelfie");
    if (!file) return showToast("Selfie wajib", "Ambil foto selfie pulang terlebih dahulu.", "error");
    setLoading(button, true, "Mengambil GPS...");
    try {
      const position = await getLocation();
      setLoading(button, true, "Mengirim absen...");
      const selfieUrl = await api.uploadSelfie(file, employee.id, "pulang");
      todayAttendance = await api.checkOut({
        guardId: employee.id,
        pin: session.pin,
        date: localDateKey(),
        checkOutTime: new Date().toISOString(),
        latitude: position.latitude,
        longitude: position.longitude,
        selfieUrl,
        note: $("#checkOutNote").value.trim(),
        isOvertime: $("#isOvertime").checked,
        overtimeNote: $("#overtimeNote").value.trim()
      });
      form.reset();
      renderToday();
      await loadHistory();
      showToast("Absen pulang berhasil", todayAttendance.check_out_note || `Status: ${todayAttendance.status}.`);
    } catch (error) {
      showToast("Absen pulang gagal", errorMessage(error), "error");
    } finally {
      setLoading(button, false);
      renderToday();
    }
  });
  $("#requestForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type='submit']");
    const payload = {
      jenis: $("#requestType").value,
      tanggal_mulai: $("#requestStart").value,
      tanggal_selesai: $("#requestEnd").value,
      alasan: $("#requestReason").value.trim(),
      bukti_url: ""
    };
    if (payload.tanggal_selesai < payload.tanggal_mulai) return showToast("Tanggal tidak valid", "Tanggal selesai tidak boleh sebelum tanggal mulai.", "error");
    setLoading(button, true, "Mengirim...");
    try {
      const proof = fileOf("requestProof");
      if (proof) payload.bukti_url = await api.uploadRequestProof(proof, employee.id);
      await api.submitEmployeeRequest(employee.id, session.pin, payload);
      form.reset();
      $("#requestStart").value = localDateKey();
      $("#requestEnd").value = localDateKey();
      await loadRequests();
      showToast("Pengajuan terkirim", "Status awal: Menunggu.");
    } catch (error) {
      showToast("Pengajuan gagal", errorMessage(error), "error");
    } finally {
      setLoading(button, false);
    }
  });
  $("#profileForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type='submit']");
    setLoading(button, true, "Menyimpan...");
    try {
      const photo = fileOf("profilePhotoInput");
      const payload = {
        photo_url: photo ? await api.uploadProfilePhoto(photo, employee.id) : employee.photo_url,
        bio: $("#employeeBio").value.trim(),
        pin: $("#newEmployeePin").value.trim()
      };
      employee = await api.updateEmployeeProfile(employee.id, session.pin, payload);
      const nextPin = payload.pin || session.pin;
      saveEmployeeSession({ employee, pin: nextPin });
      session.pin = nextPin;
      form.reset();
      renderProfile();
      showToast("Profil tersimpan");
    } catch (error) {
      showToast("Profil gagal disimpan", errorMessage(error), "error");
    } finally {
      setLoading(button, false);
    }
  });
  $("#refreshHistory").addEventListener("click", loadHistory);
  $("#refreshRequests").addEventListener("click", loadRequests);

  renderProfile();
  await Promise.all([loadToday(), loadHistory(), loadRequests(), loadOffice()]);
  icons();
}

document.addEventListener("DOMContentLoaded", async () => {
  icons();
  preserveDemoNavigation();
  if (page === "home") initHome();
  if (page === "employee-login") initEmployeeLogin();
  if (page === "employee-dashboard") await initEmployeeDashboard();
});
