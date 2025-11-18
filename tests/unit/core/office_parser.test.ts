import { describe, expect, it } from "vitest";
import AdmZip from "adm-zip";
import { OfficeParser } from "../../../packages/core/src/parsing";

function createZip(entries: Record<string, string>) {
  const zip = new AdmZip();
  Object.entries(entries).forEach(([path, content]) => {
    zip.addFile(path, Buffer.from(content, "utf8"));
  });
  return new Uint8Array(zip.toBuffer());
}

describe("OfficeParser", () => {
  it("parses docx paragraphs", async () => {
    const buffer = createZip({
      "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p><w:r><w:t>第一段内容</w:t></w:r></w:p>
            <w:p><w:r><w:t>第二段内容</w:t></w:r></w:p>
          </w:body>
        </w:document>`
    });
    const parser = new OfficeParser();
    const result = await parser.parse({
      buffer,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filename: "sample.docx"
    });
    expect(result.length).toBeGreaterThan(1);
    expect(result[0].text).toContain("第一段内容");
    expect(result[0].metadata?.officeParser).toBe("docx");
  });

  it("parses pptx slides", async () => {
    const buffer = createZip({
      "ppt/slides/slide1.xml": `<?xml version="1.0" encoding="UTF-8"?>
        <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <p:cSld>
            <p:spTree>
              <p:sp>
                <p:txBody>
                  <a:p><a:r><a:t>欢迎使用</a:t></a:r></a:p>
                </p:txBody>
              </p:sp>
            </p:spTree>
          </p:cSld>
        </p:sld>`
    });
    const parser = new OfficeParser();
    const result = await parser.parse({
      buffer,
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      filename: "slides.pptx"
    });
    expect(result.length).toBe(1);
    expect(result[0].text).toContain("欢迎使用");
    expect(result[0].metadata?.officeParser).toBe("pptx");
  });
});
