import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, TemplateError } from "./renderer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const MOCKS_DIR = path.join(PROJECT_ROOT, "mocks");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "output");

function printUsageAndExit() {
  process.stderr.write(
    [
      "Usage: npm run generate -- <템플릿이름>",
      "",
      "  <템플릿이름>   templates/ 폴더의 DOCX 파일 (확장자 생략 가능)",
      "                 동일한 이름의 JSON 파일이 mocks/ 폴더에 있어야 함",
      "",
      "예시:",
      "  npm run generate -- 이력서",
      "  npm run generate -- 취업이력서",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

function loadResponseValue(templateName) {
  const mockPath = path.join(MOCKS_DIR, `${templateName}.json`);
  let raw;
  try {
    raw = fs.readFileSync(mockPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(`Mock JSON 파일을 찾을 수 없습니다: mocks/${templateName}.json`);
    }
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Mock JSON 파싱 실패 (mocks/${templateName}.json): ${err.message}`);
  }

  if (!parsed || typeof parsed !== "object" || parsed.value === undefined) {
    throw new Error("응답 JSON에 'value' 필드가 없습니다.");
  }
  return parsed.value;
}

function buildOutputPath(baseName) {
  const candidate = path.join(OUTPUT_DIR, `${baseName}-output.docx`);
  if (!fs.existsSync(candidate)) return candidate;
  for (let i = 1; ; i++) {
    const next = path.join(OUTPUT_DIR, `${baseName}-output-${i}.docx`);
    if (!fs.existsSync(next)) return next;
  }
}

function main() {
  const [, , templateArg] = process.argv;
  if (!templateArg) printUsageAndExit();

  const templateName = path.basename(templateArg, ".docx");
  const data = loadResponseValue(templateName);
  const buffer = render(templateName, data);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = buildOutputPath(templateName);
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
