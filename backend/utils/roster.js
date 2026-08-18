const Student = require("../models/Student");
const { MAX_ROLL, DEFAULT_RANGES } = require("../config/constants");

function parseRangePart(str) {
  const m = String(str).trim().match(/^(\d+)\s*-\s*(\d+)$/);
  if (m) {
    const s = parseInt(m[1], 10);
    const e = parseInt(m[2], 10);
    if (s >= 1 && e >= s && e <= MAX_ROLL) return [s, e];
    return null;
  }
  const single = parseInt(String(str).trim(), 10);
  if (!isNaN(single) && single >= 1 && single <= MAX_ROLL) return [single, single];
  return null;
}

function parseRangesInput(input) {
  if (input === null || input === undefined || input === "") return DEFAULT_RANGES;
  let parts = input;
  if (typeof input === "string") {
    parts = input.split(",");
  }
  if (!Array.isArray(parts) || !parts.length) return null;

  const ranges = [];
  for (const p of parts) {
    let r = null;
    if (Array.isArray(p)) {
      if (p.length === 2) {
        r = parseRangePart(p[0] + "-" + p[1]);
      } else if (p.length === 1) {
        r = parseRangePart(String(p[0]));
      }
    } else {
      r = parseRangePart(String(p));
    }
    if (r) ranges.push(r);
  }
  if (!ranges.length) return null;
  return ranges;
}

function expandRanges(ranges) {
  const rolls = new Set();
  for (const [s, e] of ranges) {
    for (let r = s; r <= e; r++) rolls.add(r);
  }
  return [...rolls].sort((a, b) => a - b);
}

function totalFromRanges(ranges) {
  return expandRanges(ranges).length;
}

function formatRanges(ranges) {
  return ranges.map(([s, e]) => (s === e ? String(s) : `${s}-${e}`)).join(", ");
}

async function createRosterForSection({ owner, classId, section, ranges = DEFAULT_RANGES }) {
  const rolls = expandRanges(ranges);
  const bulkOps = rolls.map((roll) => ({
    insertOne: { document: { owner, classId, section, rollNumber: roll, name: "" } },
  }));
  await Student.collection.bulkWrite(bulkOps, { ordered: false });
  return rolls.length;
}

async function ensureRosterForSection({ owner, classId, section, ranges = DEFAULT_RANGES }) {
  const rolls = expandRanges(ranges);
  const existing = await Student.find({ owner, classId, section }).select("rollNumber -_id");
  const existingRolls = new Set(existing.map((s) => s.rollNumber));
  const bulkOps = [];
  for (const roll of rolls) {
    if (!existingRolls.has(roll)) {
      bulkOps.push({
        insertOne: { document: { owner, classId, section, rollNumber: roll, name: "" } },
      });
    }
  }
  if (bulkOps.length) {
    await Student.collection.bulkWrite(bulkOps, { ordered: false });
  }
  return bulkOps.length;
}

function normalizeSections(sections) {
  if (!Array.isArray(sections)) return [];
  const seen = new Set();
  const out = [];
  for (const s of sections) {
    const clean = String(s || "").trim().toUpperCase().slice(0, 10);
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }
  return out;
}

module.exports = {
  createRosterForSection,
  ensureRosterForSection,
  normalizeSections,
  parseRangesInput,
  expandRanges,
  totalFromRanges,
  formatRanges,
  DEFAULT_RANGES,
};
