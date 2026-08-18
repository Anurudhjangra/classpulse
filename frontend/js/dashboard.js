(function () {
  API.requireAuth();
  const user = API.getUser();
  document.getElementById("user-name").textContent = user ? user.name : "Teacher";
  document.getElementById("user-mail").textContent = user ? user.email : "";
  document.getElementById("logout-btn").addEventListener("click", (e) => { e.preventDefault(); API.logout(); });

  let currentGroup = null;

  function fmtDate(iso) {
    const [y, m, d] = iso.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${d} ${months[parseInt(m, 10) - 1]} ${y}`;
  }

  async function load() {
    try {
      const [s, classes] = await Promise.all([
        API.get("/reports/summary"),
        API.get("/classes"),
      ]);

      document.getElementById("s-students").textContent = s.totalStudents;
      document.getElementById("s-present").textContent = s.todayPresent;
      document.getElementById("s-absent").textContent = s.todayAbsent;
      document.getElementById("s-overall").textContent = s.overallPercentage + "%";

      document.getElementById("today-label").textContent = `Overview · Today ${fmtDate(s.todayDate)}`;
      document.getElementById("s-present-foot").textContent = s.todayMarked ? `${s.todayMarked}/${s.totalStudents} marked` : "Attendance not marked yet";
      document.getElementById("s-absent-foot").textContent = s.todayMarked ? "of today's records" : "—";
      document.getElementById("s-overall-foot").textContent = `${s.overallPresent} present · ${s.overallAbsent} absent of ${s.overallTotal} records`;

      renderClasses(classes.groups);
      renderRecent(s.recentDays);
    } catch (err) {
      toast(err.message, "bad");
    }
  }

  function renderClasses(groups) {
    const box = document.getElementById("my-classes");
    if (!groups || !groups.length) {
      box.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:18px;color:var(--text-muted)">
          No classes yet. <a href="./classes.html" class="btn btn-primary" style="padding:8px 14px;font-size:13px;margin-left:8px">+ Create a Class</a>
        </div>`;
      return;
    }

    box.innerHTML = groups
      .map((g, i) => {
        const done = g.today.marked === g.students && g.students > 0;
        const pct = g.students ? Math.round((g.today.marked / g.students) * 100) : 0;
        return `
        <a href="./attendance.html" style="text-decoration:none;color:inherit">
          <div style="background:var(--card);border:1.5px solid ${done ? "var(--present)" : "var(--border)"};border-radius:14px;padding:14px;transition:transform .12s,box-shadow .15s" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='var(--shadow-lg)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <strong>${esc(g.className)} · ${esc(g.section)}</strong>
              <span class="pill ${done ? "green" : "gray"}">${done ? "✔ Complete" : `${g.students - g.today.marked} left`}</span>
            </div>
            <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:8px">
              ✔ ${g.today.present} present · ✖ ${g.today.absent} absent
            </div>
            <div class="pct-bar"><div class="bar"><i style="width:${pct}%"></i></div><span class="val">${pct}%</span></div>
          </div>
        </a>`;
      })
      .join("");
  }

  function renderRecent(days) {
    const body = document.getElementById("recent-body");
    if (!days || !days.length) {
      body.innerHTML = '<tr><td colspan="5"><div class="empty"><div class="ico">📭</div>No attendance data yet. Start marking today!</div></td></tr>';
      return;
    }

    body.innerHTML = days
      .map((d) => {
        const pct = d.total ? ((d.present / d.total) * 100).toFixed(0) : 0;
        return `
          <tr>
            <td><strong>${fmtDate(d._id)}</strong></td>
            <td><span class="pill green">✔ ${d.present}</span></td>
            <td><span class="pill red">✖ ${d.absent}</span></td>
            <td class="num">${pct}%</td>
            <td><div class="pct-bar"><div class="bar"><i style="width:${pct}%"></i></div></div></td>
          </tr>`;
      })
      .join("");
  }

  function statusBadge(pct) {
    return pct >= 75 ? '<span class="pill green">✔ Regular</span>' : pct >= 60 ? '<span class="pill amber">⚠ Attention</span>' : '<span class="pill red">✖ Risk</span>';
  }

  async function checkStudent() {
    const roll = document.getElementById("sc-roll").value.trim();
    const box = document.getElementById("sc-result");
    if (!currentGroup) { toast("Pehle class select karo", "bad"); return; }
    if (!roll) { toast("Roll number daalo", "bad"); return; }
    try {
      const data = await API.get(`/reports/student-wise?classId=${currentGroup.classId}&section=${currentGroup.section}&roll=${roll}`);
      const r = data.report[0];
      if (!r || (!r.present && !r.absent)) {
        box.innerHTML = '<div class="empty" style="padding:12px"><div class="ico">🔎</div>Roll ' + roll + ' ka ab tak koi record nahi mila (student exist nahi karta ya attendance nahi).</div>';
        return;
      }
      const pct = parseFloat(r.percentage);
      box.innerHTML = `
        <div class="sc-card">
          <div class="sc-head"><strong>${esc(r.name) || "Student"}</strong> <span style="color:var(--text-muted)">· Roll ${r.rollNumber}</span> ${statusBadge(pct)}</div>
          <div class="sc-stats">
            <span>✅ Present: <strong>${r.present}</strong></span>
            <span>❌ Absent: <strong>${r.absent}</strong></span>
            <span>📅 Total: <strong>${r.total}</strong></span>
          </div>
          <div class="pct-bar"><div class="bar"><i style="width:${Math.min(pct, 100)}%"></i></div><span class="val">${r.percentage}%</span></div>
        </div>`;
    } catch (err) {
      toast(err.message, "bad");
    }
  }

  async function loadLowAttendance() {
    const box = document.getElementById("low-list");
    if (!currentGroup) {
      box.innerHTML = '<div class="empty" style="padding:12px"><div class="ico">🏫</div>Class select karo (upar class bar mein)</div>';
      return;
    }
    try {
      const data = await API.get(`/reports/student-wise?classId=${currentGroup.classId}&section=${currentGroup.section}`);
      const withAtt = data.report.filter((r) => r.present + r.absent > 0);
      if (!withAtt.length) {
        box.innerHTML = '<div class="empty" style="padding:12px"><div class="ico">📭</div>Ab tak koi attendance record nahi</div>';
        return;
      }
      const low = withAtt.sort((a, b) => parseFloat(a.percentage) - parseFloat(b.percentage)).slice(0, 6);
      box.innerHTML = low.map((r) => {
        const pct = parseFloat(r.percentage);
        const barColor = pct >= 75 ? "" : pct >= 60 ? "style='background:linear-gradient(135deg,#f59e0b,#d97706)'" : "style='background:linear-gradient(135deg,#ef4444,#dc2626)'";
        return `
        <div class="low-row">
          <span class="low-who">Roll ${r.rollNumber} · <strong>${esc(r.name) || "—"}</strong></span>
          <span class="pct-bar low-pct"><div class="bar"><i ${barColor} style="width:${Math.min(pct, 100)}%"></i></div></span>
          <span class="low-val">${r.percentage}% <span style="color:var(--text-muted);font-weight:400;font-size:12px">(${r.present}P/${r.absent}A)</span></span>
        </div>`;
      }).join("");
    } catch (err) {
      box.innerHTML = "";
      toast(err.message, "bad");
    }
  }

  document.getElementById("sc-go").addEventListener("click", checkStudent);
  document.getElementById("sc-roll").addEventListener("keydown", (e) => { if (e.key === "Enter") checkStudent(); });

  initClassBar((g) => {
    currentGroup = g;
    document.getElementById("sc-class").textContent = g ? `${g.className} · Section ${g.section}` : "class select karo";
    loadLowAttendance();
  });
  load();
})();
