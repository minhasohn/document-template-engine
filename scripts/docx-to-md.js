import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const target = process.argv[2];
if (!target) {
  console.error(
    "Usage: node scripts/docx-to-md.js <docx path relative to project root>",
  );
  process.exit(1);
}

const docxPath = path.resolve(PROJECT_ROOT, target);
const buf = fs.readFileSync(docxPath);
const zip = new PizZip(buf);
const xml = zip.file("word/document.xml")?.asText();
if (!xml) {
  console.error("word/document.xml not found");
  process.exit(1);
}

// --- minimal XML tokenizer focused on w:tbl / w:tr / w:tc / w:t ---
// Walk the body and emit markdown tables for each <w:tbl>.

function findMatching(src, startIdx, tag) {
  // startIdx points right after the opening tag's '>'.
  // Returns index of opening '<' of the matching closing tag.
  const open = new RegExp(`<${tag}(?:\\s[^>]*)?>`, "g");
  const close = new RegExp(`</${tag}>`, "g");
  open.lastIndex = startIdx;
  close.lastIndex = startIdx;
  let depth = 1;
  while (depth > 0) {
    const oM = open.exec(src);
    const cM = close.exec(src);
    if (!cM) return -1;
    if (oM && oM.index < cM.index) {
      depth++;
      close.lastIndex = oM.index + 1;
    } else {
      depth--;
      if (depth === 0) return cM.index;
      open.lastIndex = cM.index + 1;
    }
  }
  return -1;
}

function extractCellText(cellXml) {
  // Collect text runs, treating <w:br/> and paragraph boundaries as line breaks.
  // 1) Replace <w:br/> with newline marker
  let s = cellXml.replace(/<w:br\s*\/>/g, "\n");
  // 2) Split into paragraphs to insert newline between them
  const paragraphs = [];
  const pRe = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
  let m;
  while ((m = pRe.exec(s))) {
    const inner = m[1];
    const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    const parts = [];
    let tm;
    while ((tm = tRe.exec(inner))) parts.push(tm[1]);
    paragraphs.push(parts.join(""));
  }
  let text = paragraphs.join("\n");
  // decode common XML entities
  text = text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
  // collapse runs of whitespace within a line, but keep newlines
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(
      (line, i, arr) => !(line === "" && (i === 0 || i === arr.length - 1)),
    )
    .join("<br>");
  // escape markdown pipe
  text = text.replace(/\|/g, "\\|");
  return text;
}

function parseCellProps(tcOpenAttrs, tcInner) {
  // gridSpan
  let gridSpan = 1;
  const gs = /<w:gridSpan\s+w:val="(\d+)"\s*\/>/.exec(tcInner);
  if (gs) gridSpan = parseInt(gs[1], 10);
  // vMerge
  let vMerge = null; // null | "restart" | "continue"
  const vm = /<w:vMerge(?:\s+w:val="([^"]+)")?\s*\/>/.exec(tcInner);
  if (vm) vMerge = vm[1] ? vm[1] : "continue";
  return { gridSpan, vMerge };
}

function parseTable(tblXml) {
  // returns 2D array of cells: { text, gridSpan, vMerge }
  const rows = [];
  const trRe = /<w:tr(?:\s[^>]*)?>/g;
  let trM;
  while ((trM = trRe.exec(tblXml))) {
    const trStart = trM.index + trM[0].length;
    const trEnd = findMatching(tblXml, trStart, "w:tr");
    if (trEnd < 0) break;
    const trXml = tblXml.slice(trStart, trEnd);
    trRe.lastIndex = trEnd;

    const cells = [];
    const tcRe = /<w:tc(?:\s[^>]*)?>/g;
    let tcM;
    while ((tcM = tcRe.exec(trXml))) {
      const tcStart = tcM.index + tcM[0].length;
      const tcEnd = findMatching(trXml, tcStart, "w:tc");
      if (tcEnd < 0) break;
      const tcXml = trXml.slice(tcStart, tcEnd);
      tcRe.lastIndex = tcEnd;

      // tcPr block (for props)
      const tcPrMatch = /<w:tcPr>([\s\S]*?)<\/w:tcPr>/.exec(tcXml);
      const tcPrInner = tcPrMatch ? tcPrMatch[1] : "";
      const { gridSpan, vMerge } = parseCellProps("", tcPrInner);

      const text = extractCellText(tcXml);
      cells.push({ text, gridSpan, vMerge });
    }
    rows.push(cells);
  }
  return rows;
}

function rowsToGrid(rows) {
  // Expand gridSpan into multiple logical columns (copy text into first, mark
  // continuations as empty). For vMerge=continue, inherit text from the row
  // above at that column index (also empty in markdown, but keeps alignment).
  const grid = [];
  // Determine total column count by widest row after gridSpan expansion.
  let maxCols = 0;
  const expanded = rows.map((cells) => {
    const out = [];
    for (const c of cells) {
      out.push({ text: c.text, vMerge: c.vMerge, head: true });
      for (let k = 1; k < c.gridSpan; k++) {
        out.push({ text: "", vMerge: c.vMerge, head: false });
      }
    }
    if (out.length > maxCols) maxCols = out.length;
    return out;
  });
  // Pad rows to maxCols
  for (const row of expanded) {
    while (row.length < maxCols)
      row.push({ text: "", vMerge: null, head: false });
    grid.push(row);
  }
  // Handle vMerge=continue: leave blank in markdown (most renderers can't merge).
  // Nothing to do — already empty since vMerge=continue cells have their own (usually empty) text.
  return grid;
}

function gridToMarkdown(grid) {
  if (grid.length === 0) return "";
  const cols = grid[0].length;
  const headerRow = grid[0].map((c) => c.text || " ");
  const sep = Array.from({ length: cols }, () => "---");
  const lines = [];
  lines.push("| " + headerRow.join(" | ") + " |");
  lines.push("| " + sep.join(" | ") + " |");
  for (let i = 1; i < grid.length; i++) {
    lines.push("| " + grid[i].map((c) => c.text || " ").join(" | ") + " |");
  }
  return lines.join("\n");
}

// Find all <w:tbl> ... </w:tbl> blocks at any depth in the body
const tablesMd = [];
const tblRe = /<w:tbl(?:\s[^>]*)?>/g;
let tm;
let tableIndex = 0;
while ((tm = tblRe.exec(xml))) {
  const start = tm.index + tm[0].length;
  const end = findMatching(xml, start, "w:tbl");
  if (end < 0) break;
  const tblXml = xml.slice(start, end);
  tblRe.lastIndex = end;
  tableIndex++;

  const rows = parseTable(tblXml);
  const grid = rowsToGrid(rows);
  const md = gridToMarkdown(grid);
  tablesMd.push(`## Table ${tableIndex}\n\n${md}`);
}

const outDir = path.resolve(PROJECT_ROOT, "output");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(
  outDir,
  path.basename(target, path.extname(target)) + ".md",
);
const finalMd = tablesMd.join("\n\n");
fs.writeFileSync(outFile, finalMd, "utf8");
console.log(`Saved: ${path.relative(PROJECT_ROOT, outFile)}\n`);
console.log(finalMd);
