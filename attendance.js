(function () {
  API.requireAuth();
  const user = API.getUser();

  const state = {
    map: {},
    queue: [],
    current: null,
    names: {},
    history: [],
    saving: false,
    rolls: [],
    mode: "sequential",
    rndPresent: new Set(),
    rndSaving: false,
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
    modeToggle: document.getElementById("mode-toggle"),
    randomView: document.getElementById("random-view"),
    rndInput: document.getElementById("rnd-input"),
    rndPresentList: document.getElementById("rnd-present-list"),
    rndStats: document.getElementById("rnd-stats"),
    rndSubmitBtn: document.getElementById("rnd-submit-btn"),
  };

  document.getElementById("user-name").textContent = user ? user.name : "Teacher";
  document.getElementById("user-mail").textContent = user ? user.email : "";
  document.getElementById("logout-btn").addEventListener("click", (e) => { e.preventDefault(); API.logout(); });

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
    if (state.mode !== "sequential") return;
    if (e.key === "p" || e.key === "P") mark("Present");
    else if (e.key === "a" || e.key === "A") mark("Absent");
    else if (e.key === "u" || e.key === "U") undo();
  });

  async function loadGroup() {
    el.workView.style.display = "";
    el.emptyView.style.display = "none";
    el.progressText.textContent = "Loading…";
    el.badge.style.display = "";
    el.modeToggle.style.display = "";
    el.badge.textContent = `🏫 ${group.className} · Section ${group.section}`;

    state.map = {};
    state.queue = [];
    state.history = [];
    state.names = {};
    state.current = null;
    state.rndPresent = new Set();

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

      setMode(state.mode);
      toast(today.marked ? `Resuming — ${today.marked} already marked today` : `Ready! Roll ${state.rolls[0]} to ${state.rolls[state.rolls.length - 1]} — ${TOTAL} students`, "good");
    } catch (err) {
      toast(err.message, "bad");
    }
  }

  function showEmpty() {
    el.emptyView.style.display = "";
    el.workView.style.display = "none";
    el.badge.style.display = "none";
    el.modeToggle.style.display = "none";
  }

  function setMode(m) {
    state.mode = m;
    document.getElementById("mode-seq").className = m === "sequential" ? "mode-btn active" : "mode-btn";
    document.getElementById("mode-rnd").className = m === "random" ? "mode-btn active" : "mode-btn";

    if (m === "sequential") {
      el.markingView.style.display = "";
      el.randomView.style.display = "none";
      el.doneView.style.display = "none";
      showCurrent(nextUnmarked());
    } else {
      el.markingView.style.display = "none";
      el.randomView.style.display = "";
      el.doneView.style.display = "none";
      renderRandomView();
    }
  }

  document.getElementById("mode-seq").addEventListener("click", () => setMode("sequential"));
  document.getElementById("mode-rnd").addEventListener("click", () => setMode("random"));

  // ---- RANDOM MODE ----

  function renderRandomView() {
    const list = el.rndPresentList;
    const arr = Array.from(state.rndPresent).sort((a, b) => a - b);

    if (arr.length === 0) {
      list.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">No roll numbers added yet</div>';
    } else {
      list.innerHTML = arr.map((r) => {
        const name = state.names[r] || "";
        return `<span class="rnd-chip" data-roll="${r}" title="Click to remove">Roll ${r}${name ? " · " + esc(name) : ""} <span class="rnd-remove">✖</span></span>`;
      }).join("");
      list.querySelectorAll(".rnd-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          const r = parseInt(chip.dataset.roll, 10);
          state.rndPresent.delete(r);
          renderRandomView();
        });
      });
    }

    const presentCount = arr.length;
    const absentCount = TOTAL - presentCount;
    el.rndStats.innerHTML = TOTAL > 0
      ? `<strong>${presentCount}</strong> present · <span class="absent-count">${absentCount}</span> will be absent (not added) · Total ${TOTAL}`
      : "";
    el.rndSubmitBtn.disabled = presentCount === 0 || state.rndSaving;
  }

  function addRndRoll() {
    const val = el.rndInput.value.trim();
    const roll = parseInt(val, 10);
    if (isNaN(roll) || roll < 1) {
      toast("Enter a valid roll number", "bad");
      return;
    }
    if (!state.rolls.includes(roll)) {
      toast(`Roll ${roll} does not exist in this class`, "bad");
      return;
    }
    if (isMarked(roll) && state.map[roll] === "Present") {
      toast(`Roll ${roll} is already marked Present`, "info");
      el.rndInput.value = "";
      return;
    }
    if (state.rndPresent.has(roll)) {
      toast(`Roll ${roll} is already added`, "info");
      el.rndInput.value = "";
      return;
    }
    state.rndPresent.add(roll);
    el.rndInput.value = "";
    el.rndInput.focus();
    renderRandomView();
  }

  document.getElementById("rnd-add-btn").addEventListener("click", addRndRoll);
  el.rndInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addRndRoll();
    }
  });

  document.getElementById("rnd-clear-btn").addEventListener("click", () => {
    state.rndPresent = new Set();
    renderRandomView();
    el.rndInput.focus();
  });

  document.getElementById("rnd-undo-btn").addEventListener("click", async () => {
    if (state.history.length === 0 && state.rndPresent.size === 0) {
      toast("Nothing to undo", "info");
      return;
    }
    if (state.rndPresent.size > 0) {
      state.rndPresent = new Set();
      renderRandomView();
      toast("List cleared", "good");
      return;
    }
    const last = state.history[state.history.length - 1];
    if (!last) return;
    const roll = last.roll;
    try {
      await API.del(`/attendance/${roll}?classId=${group.classId}&section=${group.section}`);
      delete state.map[roll];
      state.history.pop();
      renderRandomView();
      renderChips();
      toast(`Roll ${roll} unmarked`, "good");
    } catch (err) {
      if (err.status === 404) {
        delete state.map[roll];
        state.history.pop();
        renderRandomView();
        renderChips();
      } else {
        toast(err.message, "bad");
      }
    }
  });

  el.rndSubmitBtn.addEventListener("click", async () => {
    if (state.rndSaving) return;
    const presentRolls = Array.from(state.rndPresent);
    if (presentRolls.length === 0) return;

    const absentRolls = state.rolls.filter((r) => !presentRolls.includes(r) && !isMarked(r));
    const records = [
      ...presentRolls.filter((r) => !isMarked(r)).map((r) => ({ rollNumber: r, status: "Present" })),
      ...absentRolls.map((r) => ({ rollNumber: r, status: "Absent" })),
    ];

    if (records.length === 0) {
      toast("All students are already marked", "info");
      return;
    }

    state.rndSaving = true;
    el.rndSubmitBtn.disabled = true;
    el.rndSubmitBtn.textContent = "Saving...";

    try {
      const res = await API.post("/attendance/batch", {
        classId: group.classId,
        section: group.section,
        records,
      });
      presentRolls.forEach((r) => {
        state.map[r] = "Present";
        state.history.push({ roll: r, status: "Present" });
      });
      absentRolls.forEach((r) => {
        state.map[r] = "Absent";
        state.history.push({ roll: r, status: "Absent" });
      });
      const pCount = presentRolls.filter((r) => !isMarked(r) || state.map[r] !== "Present").length;
      const aCount = absentRolls.filter((r) => !isMarked(r) || state.map[r] !== "Absent").length;
      state.rndPresent = new Set();
      renderRandomView();
      renderChips();
      updateProgress();
      showDone();
      toast(`Done! ${presentRolls.length} present, ${absentRolls.length} absent marked`, "good", 4000);
    } catch (err) {
      toast(err.message, "bad");
    } finally {
      state.rndSaving = false;
      el.rndSubmitBtn.disabled = false;
      el.rndSubmitBtn.textContent = "💾 Save Attendance";
    }
  });

  initClassBar((g) => {
    group = g;
    if (!g) {
      showEmpty();
      return;
    }
    loadGroup();
  });
})();
