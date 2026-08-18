const pad = (n) => String(n).padStart(2, "0");

const toDateStr = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const todayStr = () => toDateStr(new Date());

const validateDateStr = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime());

const monthRange = (month) => {
  const [y, m] = month.split("-").map(Number);
  const from = `${y}-${pad(m)}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${y}-${pad(m)}-${pad(lastDay)}`;
  return { from, to };
};

module.exports = { toDateStr, todayStr, validateDateStr, monthRange, pad };
