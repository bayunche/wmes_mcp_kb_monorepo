import { useState } from "react";
import { uploadDocument } from "../api";

export function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const [title, setTitle] = useState("");
  const [tenantId, setTenantId] = useState("default");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      setStatus("请选择要上传的文件");
      return;
    }
    setStatus("上传中…");
    try {
      await uploadDocument({
        file,
        title,
        tenantId,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      });
      setStatus("上传成功");
      setTitle("");
      setTags("");
      setFile(null);
      onUploaded();
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  return (
    <section className="card">
      <h2>上传文档</h2>
      <form onSubmit={handleSubmit}>
        <label>
          标题
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          Tenant ID
          <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} />
        </label>
        <label>
          标签（逗号分隔）
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
        <label>
          文件
          <input
            type="file"
            onChange={(event) => {
              const nextFile = event.target.files?.item(0) ?? null;
              setFile(nextFile);
            }}
            required
          />
        </label>
        <button type="submit">提交</button>
        {status && <p>{status}</p>}
      </form>
    </section>
  );
}
