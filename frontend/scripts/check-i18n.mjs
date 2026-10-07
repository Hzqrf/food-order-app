// Every translation key used in the code exists in English, and both languages have the same keys.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const load = (lang) => JSON.parse(readFileSync(`src/locales/${lang}.json`, "utf8"));
const flat = (o, p = "") =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
const base = (k) => k.replace(/_(one|other)$/, "");
const en = new Set(flat(load("en")).map(base));
const ms = new Set(flat(load("ms")).map(base));

const files = [];
const walk = (d) => readdirSync(d).forEach((f) => {
  const p = join(d, f);
  if (statSync(p).isDirectory()) walk(p);
  else if (/\.tsx?$/.test(f)) files.push(p);
});
walk("src");

const used = new Set();
const pattern = /\bt\("([a-zA-Z0-9_.]+)"|"((?:board|cancel|staff|admin)\.[a-zA-Z.]+)"/g;
for (const f of files) {
  for (const m of readFileSync(f, "utf8").matchAll(pattern)) used.add(m[1] ?? m[2]);
}

const problems = [
  ...[...used].filter((k) => !en.has(k)).map((k) => `used but missing in en: ${k}`),
  ...[...en].filter((k) => !ms.has(k)).map((k) => `missing in ms: ${k}`),
  ...[...ms].filter((k) => !en.has(k)).map((k) => `missing in en: ${k}`),
];
problems.forEach((p) => console.error(p));
console.log(`${used.size} keys used, ${en.size} defined, ${problems.length} problems`);
process.exit(problems.length ? 1 : 0);
