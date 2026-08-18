(function () {
  API.requireAuth();
  const user = API.getUser();

  const state = {
    mode: "summary",
    report: [],
    daily: [],
    dailyChanged: {},
    dailyBase: {},
    names: {},
    rolls: [],
    group: null,
  };

  document.getElementById("user-name").textContent = user ? user.name : "Teacher";
  document.getElementById("user-mail").textContent = user ? user.email : "";
  document.getElementById("logout-btn").addEventListener("click", (e) => { e.preventDefault(); API.logout(); });

  const pad = (n) => String(n).padStart(2, "0");
  const now = new Date();
  const monthInput = document.getElementById("f-month");
  monthInput.value = "";
  const dateInput = document.getElementById("f-date");
  dateInput.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  function fmtDate(iso) {
    const [y, m, d] = iso.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${d} ${months[parseInt(m, 10) - 1]} ${y}`;
  }

  function groupLabel() {
    return state.group ? `${state.group.className} · Section ${state.group.section}` : "";
  }

  function setMode(m) {
    state.mode = m;
    document.getElementById("tab-summary").className = m === "summary" ? "btn btn-primary" : "btn btn-outline";
    document.getElementById("tab-daily").className = m === "daily" ? "btn btn-primary" : "btn btn-outline";
    document.getElementById("summary-filters").style.display = m === "summary" ? "flex" : "none";
    document.getElementById("daily-filters").style.display = m === "daily" ? "flex" : "none";
    if (m === "summary") loadSummary();
    else loadDaily();
  }

  function queryString() {
    const q = new URLSearchParams();
    if (state.group) {
      q.set("classId", state.group.classId);
      q.set("section", state.group.section);
    }
    if (monthInput.value) q.set("month", monthInput.value);
    if (document.getElementById("f-from").value) q.set("from", document.getElementById("f-from").value);
    if (document.getElementById("f-to").value) q.set("to", document.getElementById("f-to").value);
    const search = document.getElementById("f-search").value.trim();
    if (search) q.set("roll", search);
    return q.toString();
  }

  function renderSummary() {
    const body = document.getElementById("report-body");
    const thead = document.getElementById("report-thead");
    thead.innerHTML = "<tr><th>Roll</th><th>Name</th><th>Days</th><th>Present</th><th>Absent</th><th style='width:30%'>Attendance %</th></tr>";

    if (!state.report.length) {
      body.innerHTML = '<tr><td colspan="6"><div class="empty"><div class="ico">📭</div>No attendance found for this filter</div></td></tr>';
      return;
    }

    let rows = state.report;
    const search = document.getElementById("f-search").value.trim();
    if (search) {
      const num = parseInt(search, 10);
      if (!isNaN(num)) rows = rows.filter((r) => r.rollNumber === num);
    }

    let tP = 0, tA = 0, tC = 0;
    rows.forEach((r) => { tP += r.present; tA += r.absent; tC += r.total; });

    body.innerHTML =
      rows
        .map((r) => {
          const pct = parseFloat(r.percentage);
          const barColor = pct >= 75 ? "" : pct >= 60 ? "style='background:linear-gradient(135deg,#f59e0b,#d97706)'" : "style='background:linear-gradient(135deg,#ef4444,#dc2626)'";
          return `
          <tr>
            <td class="num">${r.rollNumber}</td>
            <td>${esc(r.name) || '<span style="color:var(--text-muted)">—</span>'}</td>
            <td class="num">${r.total}</td>
            <td><span class="pill green">✔ ${r.present}</span></td>
            <td><span class="pill ${r.absent > 0 ? "red" : "gray"}">✖ ${r.absent}</span></td>
            <td><div class="pct-bar"><div class="bar"><i ${barColor} style="width:${pct}%"></i></div><span class="val">${r.percentage}%</span></div></td>
          </tr>`;
        })
        .join("") +
      `<tr style="background:#f8fafc;font-weight:700">
        <td colspan="2">Total</td>
        <td class="num">${tC}</td>
        <td><span class="pill green">✔ ${tP}</span></td>
        <td><span class="pill red">✖ ${tA}</span></td>
        <td class="val" style="text-align:right">${tC ? ((tP / tC) * 100).toFixed(1) + "%" : "—"}</td>
      </tr>`;

    document.getElementById("table-title").textContent = (search ? `Search: Roll ${search} · ` : "") + "Student-wise Report" + (groupLabel() ? ` — ${groupLabel()}` : "");
    document.getElementById("table-meta").textContent = `${rows.length} students`;
  }

  async function loadSummary() {
    document.getElementById("report-body").innerHTML = '<tr><td colspan="6"><div class="skeleton" style="height:24px"></div></td></tr>';
    document.getElementById("print-title").textContent = "Attendance Report — " + (groupLabel() ? groupLabel() + " · " : "") + (monthInput.value || "All Time");
    try {
      const data = await API.get("/reports/student-wise?" + queryString());
      state.report = data.report;
      renderSummary();
    } catch (err) {
      toast(err.message, "bad");
    }
  }

  function renderDaily() {
    const body = document.getElementById("report-body");
    const thead = document.getElementById("report-thead");
    thead.innerHTML = "<tr><th>Roll</th><th>Name</th><th style='width:200px'>Status</th></tr>";

    const rows = [];
    const rolls = state.rolls.length ? state.rolls : [1];
    for (const r of rolls) {
      const status = state.dailyChanged[r] || state.dailyBase[r] || "";
      rows.push(`<tr>
        <td class="num">${r}</td>
        <td>${esc(state.names[r]) || '<span style="color:var(--text-muted)">—</span>'}</td>
        <td>
          <select class="input daily-sel" data-roll="${r}" style="padding:8px 10px;width:140px">
            <option value="" ${status ? "" : "selected"}>— Not marked —</option>
            <option value="Present" ${status === "Present" ? "selected" : ""}>✔ Present</option>
            <option value="Absent" ${status === "Absent" ? "selected" : ""}>✖ Absent</option>
          </select>
        </td>
      </tr>`);
    }
    body.innerHTML = rows.join("");

    body.querySelectorAll(".daily-sel").forEach((sel) => {
      sel.addEventListener("change", () => {
        const roll = parseInt(sel.dataset.roll, 10);
        if (!sel.value) delete state.dailyChanged[roll];
        else state.dailyChanged[roll] = sel.value;
        updateDailyInfo();
      });
    });

    updateDailyInfo();
  }

  function updateDailyInfo() {
    const changed = Object.keys(state.dailyChanged).length;
    const info = document.getElementById("daily-info");
    const marked = Object.keys(state.dailyBase).length;
    info.innerHTML = `${changed > 0 ? `<button class="btn btn-primary" id="save-bulk" style="padding:8px 14px;font-size:13px">💾 Save ${changed} change${changed > 1 ? "s" : ""}</button>` : ""}
      <span style="margin-left:${changed ? 12 : 0}px">${marked} marked · ${state.rolls.length - marked} pending</span>`;
    const btn = document.getElementById("save-bulk");
    if (btn) {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          const records = Object.entries(state.dailyChanged).map(([roll, status]) => ({ rollNumber: parseInt(roll, 10), status }));
          const res = await API.post("/attendance/batch", { classId: state.group.classId, section: state.group.section, date: dateInput.value || todayStr(), records });
          Object.entries(state.dailyChanged).forEach(([roll, status]) => (state.dailyBase[roll] = status));
          state.dailyChanged = {};
          toast(`Saved ${res.inserted} record${res.inserted === 1 ? "" : "s"}`, "good");
          loadDaily();
        } catch (err) {
          toast(err.message, "bad");
          btn.disabled = false;
        }
      });
    }
  }

  async function loadDaily() {
    if (!state.group) return;
    const date = dateInput.value || todayStr();
    document.getElementById("print-title").textContent = "Daily Attendance — " + (groupLabel() ? groupLabel() + " · " : "") + fmtDate(date);
    document.getElementById("report-body").innerHTML = '<tr><td colspan="3"><div class="skeleton" style="height:24px"></div></td></tr>';
    try {
      const [att, students] = await Promise.all([
        API.get(`/attendance/daily?classId=${state.group.classId}&section=${state.group.section}&date=${date}`),
        API.get(`/students?classId=${state.group.classId}&section=${state.group.section}&limit=300`),
      ]);
      state.rolls = students.students.map((s) => s.rollNumber).sort((a, b) => a - b);
      students.students.forEach((s) => (state.names[s.rollNumber] = s.name));
      const base = {};
      att.records.forEach((r) => (base[r.rollNumber] = r.status));
      state.dailyBase = base;
      state.dailyChanged = {};
      renderDaily();
      document.getElementById("table-title").textContent = "Daily Attendance — " + fmtDate(date) + (groupLabel() ? ` (${groupLabel()})` : "");
      document.getElementById("table-meta").textContent = att.records.length + "/" + state.rolls.length + " marked";
    } catch (err) {
      toast(err.message, "bad");
    }
  }

  function exportCSV() {
    if (!state.report.length) {
      toast("No data to export", "info");
      return;
    }
    const rows = [["Roll Number", "Name", "Total Classes", "Present", "Absent", "Percentage"]];
    state.report.forEach((r) => rows.push([r.rollNumber, r.name || "", r.total, r.present, r.absent, r.percentage + "%"]));

    const csv = "\uFEFF" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    const groupPart = state.group ? `${state.group.className}_Sec${state.group.section}_` : "";
    a.href = URL.createObjectURL(blob);
    a.download = `attendance_report_${groupPart}${monthInput.value || "custom"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("CSV downloaded", "good");
  }

  function exportPDF() {
    if (!state.report.length && !Object.keys(state.dailyBase).length) {
      toast("No data to print", "info");
      return;
    }
    window.print();
  }

  document.getElementById("tab-summary").addEventListener("click", () => setMode("summary"));
  document.getElementById("tab-daily").addEventListener("click", () => setMode("daily"));
  document.getElementById("apply-filters").addEventListener("click", loadSummary);
  document.getElementById("all-time-btn").addEventListener("click", () => {
    monthInput.value = "";
    document.getElementById("f-from").value = "";
    document.getElementById("f-to").value = "";
    document.getElementById("f-search").value = "";
    loadSummary();
  });
  document.getElementById("load-daily").addEventListener("click", loadDaily);
  document.getElementById("f-search").addEventListener("input", () => renderSummary());
  document.getElementById("export-csv").addEventListener("click", exportCSV);
  document.getElementById("export-pdf").addEventListener("click", exportPDF);

  initClassBar((g) => {
    state.group = g;
    if (!g) {
      document.getElementById("report-body").innerHTML = '<tr><td colspan="6"><div class="empty"><div class="ico">🏫</div>Select a class to view reports</div></td></tr>';
      return;
    }
    setMode(state.mode);
  });
})();
