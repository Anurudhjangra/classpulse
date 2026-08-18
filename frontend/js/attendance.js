(function () {
  API.requireAuth();
  const user = API.getUser();

  const state = {
    map: {},          // roll -> status (already saved in DB today)
    queue: [],        // pending saves [{ roll, status }]
    current: null,    // roll currently on screen
    names: {},        // roll -> name
    history: [],      // undo stack [{ roll, status }]
    saving: false,
    rolls: [],        // actual roll numbers in this group's roster
  };
  let group = null;
  let TOTAL = 0;

  const el = {
    badge: document.getElementById("group-badge"),
    date: document.getElementById("att-date"),
    emptyView: document.getElementById("empty-view"),
    workView: document.getElementById("att-work"),
    progressText: document.getElementById("progress-text"),
    progressCount: document.getElementById("progress-count"),
    progressFill: document.getElementById("progress-fill"),
    rollNumber: document.getElementById("roll-number"),
    rollName: document.getElementById("roll-name"),
    rollOf: document.getElementById("roll-of"),
    markingView: document.getElementById("marking-view"),
    doneView: document.getElementById("done-view"),
    doneText: document.getElementById("done-text"),
    doneChips: document.getElementById("done-chips"),
    chipRow: document.getElementById("chip-row"),
    chipSummary: document.getElementById("chip-summary"),
  };

  document.getElementById("user-name").textContent = user ? user.name : "Teacher";
  document.getElementById("user-mail").textContent = user ? user.email : "";
  document.getElementById("logout-btn").addEventListener("click", (e) => { e.preventDefault(); API.logout(); });

  const pad = (n) => String(n).padStart(2, "0");
  const d = new Date();
  el.date.textContent = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;

  const isMarked = (roll) => !!state.map[roll];
  const isQueued = (roll) => state.queue.some((q) => q.roll === roll);

  function nextUnmarked() {
    for (const r of state.rolls) {
      if (!isMarked(r) && !isQueued(r)) return r;
    }
    return null;
  }

  function markedCount() {
    return Object.keys(state.map).filter((r) => state.map[r]).length + state.queue.length;
  }

  function updateProgress() {
    const marked = markedCount();
    const pct = TOTAL ? Math.round((marked / TOTAL) * 100) : 0;
    el.progressCount.textContent = `${marked} / ${TOTAL}`;
    el.progressFill.style.width = pct + "%";
    el.progressText.textContent = marked === 0 ? "Not started" : `Marking roll ${state.current || "—"}`;
  }

  function renderChips() {
    const chips = [];
    for (const r of state.rolls) {
      let cls = "q", label = "•";
      if (state.map[r]) {
        cls = state.map[r] === "Present" ? "p" : "a";
        label = state.map[r] === "Present" ? "✔" : "✖";
      } else if (isQueued(r)) {
        label = "…";
      }
      chips.push(`<span class="chip ${cls}" title="Roll ${r}">${label}</span>`);
    }
    el.chipRow.innerHTML = chips.join("");

    const p = Object.values(state.map).filter((s) => s === "Present").length;
    const a = Object.values(state.map).filter((s) => s === "Absent").length;
    el.chipSummary.textContent = `✔ ${p} present · ✖ ${a} absent · ${state.queue.length} pending save`;
  }

  function showCurrent(roll) {
    if (!roll) {
      showDone();
      return;
    }
    state.current = roll;
    el.markingView.style.display = "";
    el.doneView.style.display = "none";
    el.rollNumber.textContent = roll;
    el.rollName.textContent = state.names[roll] || "";
    el.rollOf.textContent = `Roll ${roll} of ${TOTAL}`;
    const num = el.rollNumber;
    num.style.animation = "none";
    void num.offsetWidth;
    num.style.animation = "pop 0.22s ease";
    updateProgress();
    renderChips();
  }

  function showDone() {
    state.current = null;
    el.markingView.style.display = "none";
    el.doneView.style.display = "";
    const p = Object.values(state.map).filter((s) => s === "Present").length;
    const a = Object.values(state.map).filter((s) => s === "Absent").length;
    el.doneText.innerHTML = `All <strong>${TOTAL}</strong> students marked · ✔ <span style="color:var(--present-dark)">${p}</span> present · ✖ <span style="color:var(--absent-dark)">${a}</span> absent`;
    el.doneChips.innerHTML = Array.from(el.chipRow.children).map((c) => c.outerHTML).join("");
    el.progressText.textContent = "Completed";
    updateProgress();
  }

  function pump() {
    if (state.saving || state.queue.length === 0) return;
    const item = state.queue[0];
    state.saving = true;

    API.post("/attendance/mark", { classId: group.classId, section: group.section, rollNumber: item.roll, status: item.status })
      .then(() => {
        state.map[item.roll] = item.status;
        state.history.push({ roll: item.roll, status: item.status });
      })
      .catch((err) => {
        if (err.status === 409) {
          state.map[item.roll] = item.status;
          state.history.push({ roll: item.roll, status: item.status });
        } else {
          toast(`Roll ${item.roll}: ${err.message}`, "bad", 3000);
        }
      })
      .finally(() => {
        state.queue.shift();
        state.saving = false;
        updateProgress();
        renderChips();
        pump();
      });
  }

  function mark(status) {
    if (state.current === null || !group) return;
    const roll = state.current;
    state.queue.push({ roll, status });
    state.queue = state.queue.sort((a, b) => a.roll - b.roll);
    showCurrent(nextUnmarked());
    pump();
  }

  async function undo() {
    const last = state.history[state.history.length - 1];
    if (!last) {
      toast("Nothing to undo", "info");
      return;
    }
    const roll = last.roll;
    if (state.queue.some((q) => q.roll === roll)) {
      toast("That roll is still saving, try again in a moment", "info");
      return;
    }
    try {
      await API.del(`/attendance/${roll}?classId=${group.classId}&section=${group.section}`);
      delete state.map[roll];
      state.history.pop();
      showCurrent(nextUnmarked());
      toast(`Roll ${roll} unmarked`, "good");
    } catch (err) {
      if (err.status === 404) {
        delete state.map[roll];
        state.history.pop();
        showCurrent(nextUnmarked());
      } else {
        toast(err.message, "bad");
      }
    }
  }

  document.getElementById("present-btn").addEventListener("click", () => mark("Present"));
  document.getElementById("absent-btn").addEventListener("click", () => mark("Absent"));
  document.getElementById("undo-btn").addEventListener("click", undo);
  document.getElementById("undo-last-btn").addEventListener("click", undo);

  document.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.key === "p" || e.key === "P") mark("Present");
    else if (e.key === "a" || e.key === "A") mark("Absent");
    else if (e.key === "u" || e.key === "U") undo();
  });

  async function loadGroup() {
    el.workView.style.display = "";
    el.emptyView.style.display = "none";
    el.progressText.textContent = "Loading…";
    el.badge.style.display = "";
    el.badge.textContent = `🏫 ${group.className} · Section ${group.section}`;

    state.map = {};
    state.queue = [];
    state.history = [];
    state.names = {};
    state.current = null;

    try {
      const [today, students] = await Promise.all([
        API.get(`/attendance/today?classId=${group.classId}&section=${group.section}`),
        API.get(`/students?classId=${group.classId}&section=${group.section}&limit=300`),
      ]);
      TOTAL = students.total || 0;
      state.map = today.map;
      state.rolls = students.students.map((s) => s.rollNumber).sort((a, b) => a - b);
      students.students.forEach((s) => (state.names[s.rollNumber] = s.name));

      if (TOTAL === 0) {
        el.markingView.style.display = "none";
        el.doneView.style.display = "none";
        toast("No students in this class/section yet", "info");
        return;
      }

      showCurrent(nextUnmarked());
      toast(today.marked ? `Resuming — ${today.marked} already marked today` : `Ready! Roll ${state.rolls[0]} up`, "good");
    } catch (err) {
      toast(err.message, "bad");
    }
  }

  function showEmpty() {
    el.emptyView.style.display = "";
    el.workView.style.display = "none";
    el.badge.style.display = "none";
  }

  initClassBar((g) => {
    group = g;
    if (!g) {
      showEmpty();
      return;
    }
    loadGroup();
  });
})();
