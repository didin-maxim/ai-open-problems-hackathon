"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const appPath = path.join(root, "app.js");
const source = fs.readFileSync(appPath, "utf8");

const errors = [];
const warnings = [];

const REQUIRED_TASK_FIELDS = [
  "id",
  "title",
  "status",
  "area",
  "year",
  "author",
  "proposedBy",
  "difficulty",
  "sourceTitle",
  "summary",
  "statement",
  "perspective",
  "review",
  "progress",
  "comments",
  "aiNotes",
];

const MOJIBAKE_FRAGMENTS = [
  "Рђ",
  "Р‘",
  "Р’",
  "Р“",
  "Р”",
  "Р•",
  "Р–",
  "Р—",
  "Р",
  "Р",
  "Рљ",
  "Р›",
  "Рњ",
  "Рќ",
  "Рћ",
  "Рџ",
  "Р ",
  "РЎ",
  "Рў",
  "РЈ",
  "Р¤",
  "РҐ",
  "Р¦",
  "Р§",
  "РЁ",
  "Р°",
  "Р±",
  "РІ",
  "Рі",
  "Рґ",
  "Рµ",
  "Р¶",
  "Р·",
  "Рё",
  "Р№",
  "Рє",
  "Р»",
  "Рј",
  "РЅ",
  "Рѕ",
  "Рї",
  "СЂ",
  "СЃ",
  "С‚",
  "Сѓ",
  "С„",
  "С…",
  "С†",
  "С‡",
  "С€",
  "С‰",
  "СЉ",
  "С‹",
  "СЊ",
  "СЌ",
  "СЋ",
  "СЏ",
];

const ALLOWED_LATIN = new Set([
  "AB",
  "AB-Mastermind",
  "A283190",
  "Annuli",
  "Baraskar",
  "Beineke",
  "Bert",
  "Bezdek",
  "Black",
  "Black-Peg",
  "Bradley",
  "Carsten",
  "Chase",
  "CircularShift",
  "Combinatorial",
  "Combinatorics",
  "Computer",
  "Conjecture",
  "Covering",
  "Dean",
  "Discrete",
  "Dudek",
  "Electronic",
  "Engel",
  "English",
  "Erdos",
  "Euler",
  "Gavenciak",
  "Gallai",
  "Grytczuk",
  "Hartnell",
  "Harary",
  "Hiveley",
  "Huang",
  "Ingrid",
  "Jiang",
  "JIS",
  "Journal",
  "Kutin",
  "Krueger",
  "Lee",
  "Li",
  "Mastermind",
  "Mathematics",
  "Mizrahi",
  "OEIS",
  "Omkar",
  "Pandey",
  "Peg",
  "Permutation",
  "Permutations",
  "Pierce",
  "Plummer",
  "Polygonal",
  "Problem",
  "Ramsey",
  "Ruci",
  "Samuel",
  "Science",
  "Shallit",
  "Smithline",
  "Strips",
  "Tarry",
  "TeX",
  "Terry",
  "Theoretical",
  "Thomassen",
  "Thomassen-Toft",
  "Toft",
  "Theory",
  "Twins",
  "Variations",
  "Vukusic",
  "Wheaton-Werle",
  "White",
  "Wisewell",
  "Wordle",
  "Wordle-like",
  "Zilin",
  "Zhu",
  "alpha",
  "alpha-critical",
  "annulus",
  "arXiv",
  "biased",
  "cycle",
  "cycles",
  "conjecture",
  "covering",
  "critical",
  "elimination",
  "exc",
  "expansions",
  "feedback",
  "games",
  "graph",
  "graphs",
  "induced",
  "liminf",
  "limsup",
  "line",
  "line-critical",
  "log",
  "mod",
  "multicolor",
  "non",
  "permutation",
  "planks",
  "punctured",
  "removable",
  "separating",
  "single",
  "sigma",
  "ski",
  "series",
  "knockout",
  "tournaments",
  "tau",
  "tau-critical",
  "total",
  "width",
]);

const STYLE_CHECK_PATH = /\.(title|summary|statement|perspective|aiNotes)$|\.review\.\d+$|\.progress\.\d+\.note$|\.comments\.\d+\.text$/;

function fakeElement() {
  return {
    addEventListener() {},
    append() {},
    focus() {},
    querySelector() {
      return fakeElement();
    },
    setAttribute() {},
    classList: { add() {} },
    content: {
      firstElementChild: {
        cloneNode() {
          return fakeElement();
        },
      },
    },
  };
}

function loadAppData() {
  const context = vm.createContext({
    console,
    document: {
      querySelector() {
        return fakeElement();
      },
    },
    window: {
      addEventListener() {},
    },
    location: { hash: "" },
    URL,
    URLSearchParams,
    navigator: { clipboard: { writeText() {} } },
  });

  vm.runInContext(source, context, { filename: appPath });
  return {
    tasks: vm.runInContext("TASKS", context),
    statuses: vm.runInContext("STATUSES", context),
  };
}

function visitStrings(value, callback, pathParts = []) {
  if (typeof value === "string") {
    callback(value, pathParts.join("."));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitStrings(item, callback, pathParts.concat(index)));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => visitStrings(item, callback, pathParts.concat(key)));
  }
}

function stripTex(text) {
  return text.replace(/\\\((?:.|\n)*?\\\)/g, " ");
}

function validateText(text, label) {
  if (text.includes("\uFFFD")) {
    errors.push(`${label}: найден символ замены �`);
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(text)) {
    errors.push(`${label}: найден управляющий символ, часто это признак битой кодировки`);
  }
  for (const fragment of MOJIBAKE_FRAGMENTS) {
    if (text.includes(fragment)) {
      errors.push(`${label}: похоже на битую кириллицу (${fragment})`);
      break;
    }
  }
  if (/[^\w]([$])[^$]|[$]{2}/.test(` ${text} `)) {
    errors.push(`${label}: используйте \\(...\\) вместо dollar-TeX`);
  }

  const opens = (text.match(/\\\(/g) || []).length;
  const closes = (text.match(/\\\)/g) || []).length;
  if (opens !== closes) {
    errors.push(`${label}: несбалансированные TeX-разделители \\( и \\)`);
  }

  if (!STYLE_CHECK_PATH.test(label)) return;

  const outsideTex = stripTex(text)
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[\w.+-]+@[\w.-]+/g, " ");

  if (/(^|[\s(])[A-Za-zА-Яа-я]\s*(?:>=|<=|->|=)\s*[-A-Za-zА-Яа-я0-9]/.test(outsideTex)) {
    warnings.push(`${label}: возможная сырая формула вне TeX`);
  }
  if (/[A-Za-zА-Яа-я][A-Za-zА-Яа-я0-9]*_[A-Za-zА-Яа-я0-9{]/.test(outsideTex)) {
    warnings.push(`${label}: нижний индекс похож на TeX без \\(...\\)`);
  }
  if (/\b(?:lim|liminf|limsup|floor|sqrt)\b/.test(outsideTex)) {
    warnings.push(`${label}: математический оператор похож на текст вне TeX`);
  }

  const latinTokens = outsideTex.match(/\b[A-Za-z][A-Za-z-]{2,}\b/g) || [];
  const suspicious = latinTokens.filter((token) => {
    const clean = token.replace(/^-+|-+$/g, "");
    if (ALLOWED_LATIN.has(clean)) return false;
    if (/^[ivxlcdm]+$/i.test(clean)) return false;
    return true;
  });
  if (suspicious.length >= 3) {
    warnings.push(`${label}: много латиницы, проверьте перевод (${[...new Set(suspicious)].slice(0, 6).join(", ")})`);
  }
}

function validateUrl(url, label) {
  if (!url) return;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      errors.push(`${label}: ссылка должна начинаться с http или https`);
    }
  } catch {
    errors.push(`${label}: некорректная ссылка`);
  }
}

function validateTasks(tasks, statuses) {
  const ids = new Set();
  for (const task of tasks) {
    const prefix = `task:${task.id || "<no-id>"}`;
    for (const field of REQUIRED_TASK_FIELDS) {
      if (task[field] === undefined || task[field] === null || task[field] === "") {
        errors.push(`${prefix}: отсутствует обязательное поле ${field}`);
      }
    }
    if (ids.has(task.id)) errors.push(`${prefix}: повторяющийся id`);
    ids.add(task.id);
    if (!/^[a-z0-9-]+$/.test(task.id || "")) errors.push(`${prefix}: id должен быть slug в нижнем регистре`);
    if (!statuses[task.status]) errors.push(`${prefix}: неизвестный статус ${task.status}`);
    if (!Array.isArray(task.review) || task.review.length === 0) errors.push(`${prefix}: нужен обзор литературы`);
    if (!Array.isArray(task.progress) || task.progress.length === 0) errors.push(`${prefix}: нужен блок прогресса`);
    if (!Array.isArray(task.comments) || task.comments.length === 0) errors.push(`${prefix}: нужны комментарии/подсказки`);
    if (task.proposedBy === "ИИ" && !task.tags?.includes("предложено ИИ")) {
      errors.push(`${prefix}: задачи, предложенные ИИ, должны иметь метку "предложено ИИ"`);
    }
    validateUrl(task.sourceUrl, `${prefix}.sourceUrl`);
    visitStrings(task, (text, label) => validateText(text, `${prefix}.${label}`));
  }
}

if (source.includes("your-org/ai-open-problems-hackathon")) {
  errors.push("CONFIG.repository все еще содержит placeholder");
}
if (source.includes("�")) {
  errors.push("app.js содержит символ замены �");
}
if (source.includes("organizer@example.com")) {
  warnings.push("CONFIG.contactEmail все еще содержит placeholder; письмо без регистрации нужно настроить перед публичным запуском");
}

const { tasks, statuses } = loadAppData();
validateTasks(tasks, statuses);

if (warnings.length) {
  console.warn("Warnings:");
  for (const warning of [...new Set(warnings)]) console.warn(`- ${warning}`);
}

if (errors.length) {
  console.error("Errors:");
  for (const error of [...new Set(errors)]) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Validated ${tasks.length} tasks: no blocking content errors.`);
