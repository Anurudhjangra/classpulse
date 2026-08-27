async function initClassBar(onChange) {
  const container = document.getElementById("class-bar");
  if (!container) return null;

  const saved = API.getGroup();
  let classes = [];
  let selected = saved && saved.classId ? saved : null;

  async function load() {
    try {
      const data = await API.get("/classes");
      classes = data.classes || [];

      if (!classes.length) {
        container.innerHTML = `
          <div class="classbar-empty">
            <span>No classes yet. Create your first class to start marking attendance.</span>
            <a href="./classes.html" class="btn btn-primary" style="padding:9px 14px;font-size:13px">+ Create a Class</a>
          </div>`;
        if (onChange) onChange(null);
        return;
      }

      if (!selected || !classes.some((c) => c._id === selected.classId)) {
        const first = classes[0];
        selected = { classId: first._id, className: first.name, section: first.sections[0] };
      }

      render();
      emit();
      return;
    } catch (err) {
      container.innerHTML = `<div class="classbar-empty">Failed to load classes: ${esc(err.message)}</div>`;
      if (onChange) onChange(null);
    }
  }

  function emit() {
    API.setGroup(selected);
    if (onChange) onChange(selected);
  }

  function render() {
    const clsSel = document.getElementById("cb-class");
    const secSel = document.getElementById("cb-section");

    if (!clsSel) {
      container.innerHTML = `
        <div class="classbar">
          <div class="cb-item"><label>Class</label><select id="cb-class" class="input"></select></div>
          <div class="cb-item"><label>Section</label><select id="cb-section" class="input"></select></div>
          <a href="./classes.html" class="btn btn-outline cb-manage">⚙ Manage Classes</a>
        </div>`;
    }

    const cls = document.getElementById("cb-class");
    const sec = document.getElementById("cb-section");

    cls.innerHTML = classes.map((c) => `<option value="${c._id}">${esc(c.name)}</option>`).join("");
    cls.value = selected.classId;

    const current = classes.find((c) => c._id === selected.classId) || classes[0];
    sec.innerHTML = current.sections.map((s) => `<option value="${s}">Section ${esc(s)}</option>`).join("");
    sec.value = selected.section;

    cls.onchange = () => {
      const c = classes.find((x) => x._id === cls.value);
      selected = { classId: c._id, className: c.name, section: c.sections[0] };
      render();
      emit();
    };
    sec.onchange = () => {
      selected.section = sec.value;
      render();
      emit();
    };
  }

  await load();
  return {
    get: () => selected,
    reload: load,
  };
}
