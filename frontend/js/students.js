(function () {
  API.requireAuth();
  const user = API.getUser();

  const state = { all: [], editing: null, group: null };

  document.getElementById("user-name").textContent = user ? user.name : "Teacher";
  document.getElementById("user-mail").textContent = user ? user.email : "";
  document.getElementById("logout-btn").addEventListener("click", (e) => { e.preventDefault(); API.logout(); });

  const body = document.getElementById("student-body");
  const search = document.getElementById("search");

  function render() {
    const q = search.value.trim().toLowerCase();
    let list = state.all;
    if (q) {
      const num = parseInt(q, 10);
      list = list.filter((s) => {
        const matchNum = !isNaN(num) && s.rollNumber === num;
        const matchName = s.name && s.name.toLowerCase().includes(q);
        return matchNum || matchName;
      });
    }

    document.getElementById("count-info").textContent = `${list.length} of ${state.all.length} students`;

    if (!list.length) {
      body.innerHTML = '<tr><td colspan="3"><div class="empty"><div class="ico">🔍</div>No students match your search</div></td></tr>';
      return;
    }

    body.innerHTML = list
      .map((s) => {
        if (state.editing === s.rollNumber) {
          return `<tr>
            <td class="num">${s.rollNumber}</td>
            <td><input type="text" class="input name-input" id="edit-input" value="${esc(s.name || "")}" placeholder="Student name" maxlength="60" /></td>
            <td>
              <button class="btn btn-primary save-btn" id="edit-save">Save</button>
              <button class="btn save-btn" id="edit-cancel" style="color:var(--text-muted)">Cancel</button>
            </td>
          </tr>`;
        }
        return `<tr>
          <td class="num">${s.rollNumber}</td>
          <td class="name-cell">
            <span>${esc(s.name) || '<span style="color:var(--text-muted)">No name</span>'}</span>
          </td>
          <td><button class="btn btn-outline save-btn edit-btn" data-roll="${s.rollNumber}">✎ Edit</button></td>
        </tr>`;
      })
      .join("");

    if (state.editing !== null) {
      const input = document.getElementById("edit-input");
      if (input) {
        input.focus();
        input.select();
        document.getElementById("edit-save").addEventListener("click", saveEdit);
        document.getElementById("edit-cancel").addEventListener("click", () => { state.editing = null; render(); });
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") saveEdit();
          if (e.key === "Escape") { state.editing = null; render(); }
        });
      }
      return;
    }

    body.querySelectorAll(".edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.editing = parseInt(btn.dataset.roll, 10);
        render();
      });
    });
  }

  async function saveEdit() {
    const input = document.getElementById("edit-input");
    const name = input.value.trim();
    try {
      await API.put("/students/" + state.editing, { name, classId: state.group.classId, section: state.group.section });
      const s = state.all.find((x) => x.rollNumber === state.editing);
      if (s) s.name = name;
      state.editing = null;
      toast(`Roll ${state.editing} updated`, "good");
      render();
    } catch (err) {
      toast(err.message, "bad");
    }
  }

  search.addEventListener("input", render);

  async function load() {
    if (!state.group) return;
    document.getElementById("stu-sub").textContent = `Roster of ${state.group.className} · Section ${state.group.section}`;
    body.innerHTML = '<tr><td colspan="3"><div class="skeleton" style="height:24px"></div></td></tr>';
    try {
      const data = await API.get(`/students?classId=${state.group.classId}&section=${state.group.section}&limit=200`);
      state.all = data.students;
      render();
    } catch (err) {
      toast(err.message, "bad");
    }
  }

  initClassBar((g) => {
    state.group = g;
    state.editing = null;
    if (!g) {
      state.all = [];
      body.innerHTML = '<tr><td colspan="3"><div class="empty"><div class="ico">🏫</div>Select a class to view its students</div></td></tr>';
      document.getElementById("count-info").textContent = "";
      return;
    }
    load();
  });
})();
