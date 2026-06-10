import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/inspect-docx.mjs <docx path relative to project root>");
  process.exit(1);
}

const docxPath = path.resolve(PROJECT_ROOT, target);
const buf = fs.readFileSync(docxPath);
const zip = new PizZip(buf);

// 1) zip 내 파일 목록
const entries = Object.keys(zip.files).sort();
console.log("=== ZIP entries ===");
console.log(entries.join("\n"));

// 2) document.xml 본문 저장
const docXml = zip.file("word/document.xml")?.asText();
if (!docXml) {
  console.error("word/document.xml not found");
  process.exit(1);
}
const outDir = path.resolve(PROJECT_ROOT, "output", "_inspect");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, path.basename(target) + ".document.xml");
fs.writeFileSync(outFile, docXml, "utf8");
console.log(`\n=== document.xml saved to: ${path.relative(PROJECT_ROOT, outFile)} ===`);

// 3) 텍스트만 추출 (모든 w:t 콘텐츠 이어붙임)
const texts = [];
const textRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
let m;
while ((m = textRe.exec(docXml))) {
  texts.push(m[1]);
}
console.log("\n=== 본문 텍스트 (단순 추출) ===");
console.log(texts.join("\n"));

// 4) 테이블 개수 / 구조 요약
const tableCount = (docXml.match(/<w:tbl[\s>]/g) || []).length;
const rowCount = (docXml.match(/<w:tr[\s>]/g) || []).length;
const cellCount = (docXml.match(/<w:tc[\s>]/g) || []).length;
console.log("\n=== 구조 요약 ===");
console.log(`tables: ${tableCount}`);
console.log(`rows:   ${rowCount}`);
console.log(`cells:  ${cellCount}`);
