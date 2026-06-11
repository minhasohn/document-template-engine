import mammoth from "mammoth";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const target = process.argv[2];
if (!target) {
  console.error(
    "Usage: node scripts/docx-to-html.js <docx path relative to project root>",
  );
  process.exit(1);
}

const filePath = path.resolve(PROJECT_ROOT, target);
const buffer = fs.readFileSync(filePath);
const result = await mammoth.convertToHtml({ buffer });

const outDir = path.resolve(PROJECT_ROOT, "output");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(
  outDir,
  path.basename(target, path.extname(target)) + ".html",
);
fs.writeFileSync(outFile, result.value, "utf8");

console.log(`Saved: ${path.relative(PROJECT_ROOT, outFile)}`);
if (result.messages.length > 0) {
  console.warn(`Messages (${result.messages.length}):`);
  for (const m of result.messages) console.warn(`  [${m.type}] ${m.message}`);
}
