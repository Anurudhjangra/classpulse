(function () {
  API.requireAuth();
  const user = API.getUser();

  document.getElementById("user-name").textContent = user ? user.name : "Teacher";
  document.getElementById("user-mail").textContent = user ? user.email : "";
  document.getElementById("logout-btn").addEventListener("click", (e) => { e.preventDefault(); API.logout(); });

  const grid = document.getElementById("classes-grid");
  const modalRoot = document.getElementById("modal-root");
  let classes = [];
  let groups = [];

  function openModal(title, bodyHtml, onOk) {
    modalRoot.innerHTML = `
      <div class="modal-overlay">
        <div class="modal">
          <h3>${esc(title)}</h3>
          ${bodyHtml}
          <div class="modal-actions">
            <button class="btn btn-outline" data-close>Cancel</button>
            <button class="btn btn-primary" id="modal-ok">Save</button>
          </div>
        </div>
      </div>`;
    const close = () => (modalRoot.innerHTML = "");
    modalRoot.querySelector("[data-close]").onclick = close;
    modalRoot.querySelector(".modal-overlay").onclick = (e) => { if (e.target.classList.contains("modal-overlay")) close(); };
    document.getElementById("modal-ok").onclick = async () => {
      const okBtn = document.getElementById("modal-ok");
      okBtn.disabled = true;
      try {
        await onOk();
        close();
      } catch (err) {
        toast(err.message, "bad");
        okBtn.disabled = false;
      }
    };
  }

  function rollRangesOf(c, sec) {
    if (c.rollRanges && c.rollRanges[sec]) return c.rollRanges[sec];
    return [[1, 180]];
  }

  function formatRanges(ranges) {
    return ranges.map(([s, e]) => (s === e ? String(s) : s + "-" + e)).join(", ");
  }

  function countFromRanges(ranges) {
    let n = 0;
    for (const [s, e] of ranges) n += e - s + 1;
    return n;
  }

  function render() {
    if (!classes.length) {
      grid.innerHTML = `
        <div class="class-card" style="grid-column:1/-1">
          <div class="empty"><div class="ico">🏫</div><strong>No classes yet.</strong><br/>Create your first class to start taking attendance.</div>
          <button class="btn btn-primary btn-block" onclick="openCreate()">+ Create a Class</button>
        </div>`;
      return;
    }

    grid.innerHTML =
      `<div class="create-card" id="create-card">
         <div class="plus">+</div>
         <div>Create a Class</div>
       </div>` +
      classes
        .map((c, i) => {
          const secGroups = groups.filter((g) => g.classId === c._id);
          const totalStudents = secGroups.reduce((acc, g) => acc + g.students, 0);
          const tiles = c.sections
            .map((sec) => {
              const info = groups.find((g) => g.classId === c._id && g.section === sec);
              const marked = info ? info.today.marked : 0;
              const total = info ? info.students : 0;
              const done = marked === total && total > 0;
              const ranges = rollRangesOf(c, sec);
              return `<span class="section-tile ${done ? "today-ok" : ""}" title="Rolls: ${esc(formatRanges(ranges))}">
                <strong>${esc(sec)}</strong><span class="cnt">${marked}/${total}</span>
                <span class="ranges">${esc(formatRanges(ranges))}</span>
                <button class="rolls-edit" data-act="rolls" data-id="${c._id}" data-sec="${esc(sec)}" title="Edit roll numbers">✎ Rolls</button>
              </span>`;
            })
            .join("");
          return `
          <div class="class-card" style="animation-delay:${i * 0.05}s">
            <div class="cls-head">
              <div>
                <div class="cls-name">${esc(c.name)}</div>
                <div class="cls-stats">${totalStudents} students</div>
              </div>
              <a href="./attendance.html" class="btn btn-primary" style="padding:8px 12px;font-size:13px">✏️ Mark</a>
            </div>
            <div class="section-tiles">${tiles}</div>
            <div class="cls-actions">
              <button class="btn btn-outline" data-act="rename" data-id="${c._id}">✎ Rename</button>
              <button class="btn btn-outline" data-act="section" data-id="${c._id}">+ Section</button>
              <button class="btn btn-outline" data-act="delete" data-id="${c._id}" style="color:var(--absent-dark)">🗑 Delete</button>
            </div>
          </div>`;
        })
        .join("");

    document.getElementById("create-card").onclick = openCreate;

    grid.querySelectorAll("[data-act]").forEach((btn) => {
      const cls = classes.find((c) => c._id === btn.dataset.id);
      btn.onclick = () => {
        if (btn.dataset.act === "rename") openRename(cls);
        else if (btn.dataset.act === "section") openAddSection(cls);
        else if (btn.dataset.act === "delete") openDelete(cls);
        else openRolls(cls, btn.dataset.sec);
      };
    });
  }

  function parseRollsText(text) {
    const rolls = {};
    for (const line of String(text || "").split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      const m = t.match(/^([A-Za-z0-9]+)\s*[:=]\s*(.+)$/);
      if (!m) continue;
      rolls[m[1].trim().toUpperCase()] = m[2].trim();
    }
    return rolls;
  }

  function openCreate() {
    openModal(
      "Create a Class",
      `<div class="field"><label>Class name</label><input class="input" id="m-name" placeholder="e.g. Class 12" maxlength="60" /></div>
       <div class="field"><label>Sections (comma separated)</label><input class="input" id="m-sections" placeholder="e.g. A, B, C" /></div>
       <div class="field"><label>Roll numbers per section (optional)</label>
         <textarea class="input" id="m-rolls" rows="3" placeholder="A: 1-80, 161-168&#10;B: 81-160, 169-185" style="resize:vertical"></textarea></div>
       <div style="font-size:12.5px;color:var(--text-muted)">One line per section, e.g. <b>A: 1-80, 161-168</b>. Empty = roll 1–180 automatically.</div>`,
      async () => {
        const name = document.getElementById("m-name").value.trim();
        const sections = document.getElementById("m-sections").value.split(",");
        if (!name) throw new Error("Class name is required");
        const body = { name, sections };
        const rolls = parseRollsText(document.getElementById("m-rolls").value);
        if (Object.keys(rolls).length) body.rolls = rolls;
        const res = await API.post("/classes", body);
        toast(res.message, "good");
        await load();
      }
    );
    setTimeout(() => document.getElementById("m-name").focus(), 50);
  }

  function openRolls(cls, sec) {
    const current = formatRanges(rollRangesOf(cls, sec));
    openModal(
      `Roll Numbers — ${esc(cls.name)} · Sec ${esc(sec)}`,
      `<div class="field"><label>Roll numbers (ranges, comma separated)</label>
         <input class="input" id="m-rolls-value" value="${esc(current)}" placeholder="e.g. 1-80, 161-168" /></div>
       <div style="font-size:12.5px;color:var(--text-muted)">Example: <b>1-80, 161-168</b> means rolls 1–80 and 161–168 only.<br/>Saving replaces this section's student list with the new rolls (existing attendance for this section is removed).</div>`,
      async () => {
        const value = document.getElementById("m-rolls-value").value.trim();
        if (!value) throw new Error("Roll numbers are required");
        const res = await API.put("/classes/" + cls._id, { section: sec, rolls: value });
        toast(res.message, "good");
        await load();
      }
    );
    setTimeout(() => { const i = document.getElementById("m-rolls-value"); i.focus(); i.select(); }, 50);
  }

  function openRename(cls) {
    openModal(
      "Rename Class",
      `<div class="field"><label>New class name</label><input class="input" id="m-name" value="${esc(cls.name)}" maxlength="60" /></div>`,
      async () => {
        const name = document.getElementById("m-name").value.trim();
        if (!name) throw new Error("Class name is required");
        const res = await API.put("/classes/" + cls._id, { name });
        toast(res.message, "good");
        await load();
      }
    );
    setTimeout(() => { const i = document.getElementById("m-name"); i.focus(); i.select(); }, 50);
  }

  function openAddSection(cls) {
    openModal(
      `Add Section to ${esc(cls.name)}`,
      `<div class="field"><label>New section (single letter)</label><input class="input" id="m-section" placeholder="e.g. C" maxlength="10" /></div>
       <div style="font-size:12.5px;color:var(--text-muted)">A new roster (roll 1–180 by default) is created for this section. You can set custom roll numbers later via ✎ Rolls.</div>`,
      async () => {
        const sec = document.getElementById("m-section").value.trim().toUpperCase();
        if (!sec) throw new Error("Section is required");
        const sections = cls.sections.concat(sec);
        const res = await API.put("/classes/" + cls._id, { sections });
        toast(res.message, "good");
        await load();
      }
    );
    setTimeout(() => document.getElementById("m-section").focus(), 50);
  }

  function openDelete(cls) {
    openModal(
      `Delete ${esc(cls.name)}?`,
      `<div style="font-size:14px;color:var(--text-muted)">This will permanently delete the class, all ${cls.sections.length > 1 ? "its sections and their" : "its"} students and attendance records. This cannot be undone.</div>`,
      async () => {
        const res = await API.del("/classes/" + cls._id);
        toast(res.message, "good");
        await load();
      }
    );
  }

  async function load() {
    grid.innerHTML = '<div class="card" style="grid-column:1/-1"><div class="skeleton" style="height:80px"></div></div>';
    try {
      const data = await API.get("/classes");
      classes = data.classes;
      groups = data.groups;
      render();
    } catch (err) {
      toast(err.message, "bad");
    }
  }

  window.openCreate = openCreate;
  load();
})();
