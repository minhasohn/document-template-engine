const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

const TEMPLATES_DIR = path.resolve(__dirname, "..", "templates");

function resolveTemplatePath(templateName) {
  const safeName = path.basename(templateName, ".docx");
  const resolved = path.join(TEMPLATES_DIR, `${safeName}.docx`);
  if (path.dirname(resolved) !== TEMPLATES_DIR) {
    throw new TemplateError("INVALID_TEMPLATE_NAME", `Invalid template name: ${templateName}`);
  }
  return resolved;
}

class TemplateError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = "TemplateError";
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function render(templateName, data) {
  const templatePath = resolveTemplatePath(templateName);

  let content;
  try {
    content = fs.readFileSync(templatePath);
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new TemplateError("TEMPLATE_NOT_FOUND", `Template not found: ${templateName}`);
    }
    throw new TemplateError("TEMPLATE_READ_FAILED", `Failed to read template: ${templateName}`, err);
  }

  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  try {
    doc.render(data);
  } catch (err) {
    throw new TemplateError("RENDER_FAILED", buildRenderErrorMessage(err), err);
  }

  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}

function buildRenderErrorMessage(err) {
  if (!err.properties || !Array.isArray(err.properties.errors)) {
    return err.message || "Failed to render template";
  }
  const details = err.properties.errors
    .map((e) => e.properties && e.properties.explanation)
    .filter(Boolean)
    .join("; ");
  return details ? `Render failed: ${details}` : err.message;
}

module.exports = { render, TemplateError, TEMPLATES_DIR };
