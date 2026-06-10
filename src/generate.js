import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, TemplateError } from "./renderer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const MOCKS_PATH = path.join(PROJECT_ROOT, "mocks", "response.json");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "output");

function printUsageAndExit() {
  process.stderr.write(
    [
      "Usage: node src/generate.js <템플릿파일명>",
      "",
      "  <템플릿파일명>   templates/ 폴더 안의 DOCX 파일 (확장자 생략 가능)",
      "",
      "예시:",
      "  node src/generate.js 이력서.docx",
      "  node src/generate.js 이력서",
      "",
    ].join("\n")
  );
  process.exit(1);
}

function loadResponse() {
  let raw;
  try {
    raw = fs.readFileSync(MOCKS_PATH, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(`Mock JSON 파일을 찾을 수 없습니다: ${MOCKS_PATH}`);
    }
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Mock JSON 파싱 실패 (${MOCKS_PATH}): ${err.message}`);
  }

  if (!parsed || typeof parsed !== "object" || parsed.value === undefined) {
    throw new Error("응답 JSON에 'value' 필드가 없습니다.");
  }
  return parsed.value;
}

function buildOutputPath(templateName) {
  const baseName = path.basename(templateName, ".docx");
  const candidate = path.join(OUTPUT_DIR, `${baseName}-rendered.docx`);
  if (!fs.existsSync(candidate)) return candidate;

  for (let i = 1; ; i++) {
    const next = path.join(OUTPUT_DIR, `${baseName}-rendered-${i}.docx`);
    if (!fs.existsSync(next)) return next;
  }
}

function main() {
  const [, , templateArg] = process.argv;
  if (!templateArg) printUsageAndExit();

  const data = loadResponse();
  const buffer = render(templateArg, data);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = buildOutputPath(templateArg);
  fs.writeFileSync(outputPath, buffer);

  process.stdout.write(`완료: ${path.relative(PROJECT_ROOT, outputPath)}\n`);
}

try {
  main();
} catch (err) {
  if (err instanceof TemplateError) {
    process.stderr.write(`[${err.code}] ${err.message}\n`);
  } else {
    process.stderr.write(`${err.message}\n`);
  }
  process.exit(1);
}
