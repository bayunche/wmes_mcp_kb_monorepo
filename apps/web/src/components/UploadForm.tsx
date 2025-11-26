import { useEffect, useMemo, useRef, useState } from "react";
import { uploadDocuments } from "../api";
import { useOrgOptions } from "../hooks/useOrgOptions";
import { AsyncPhase, useAsyncTask } from "../hooks/useAsyncTask";
import { useToast } from "./ui/Toast";
import { GlassCard } from "./ui/GlassCard";
import { SectionHeader } from "./ui/SectionHeader";
import { Field } from "./ui/Field";
import { StatusPill } from "./ui/StatusPill";
import { Button } from "./ui/Button";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none";

function deriveTitle(filename: string) {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex > 0) {
    return filename.slice(0, dotIndex);
  }
  return filename;
}

type UploadResult = { docId: string; filename: string; status: string; message?: string };

export function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const { tenants, libraries, loading: optionLoading, error: optionError, refresh } = useOrgOptions();
  const [tenantId, setTenantId] = useState("default");
  const [libraryId, setLibraryId] = useState("default");
  const [files, setFiles] = useState<File[]>([]);
  const [fileTitles, setFileTitles] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [results, setResults] = useState<UploadResult[]>([]);
  const { push: toastPush } = useToast();
  const lastPhaseRef = useRef<AsyncPhase>("idle");

  const libraryOptions = useMemo(() => {
    if (!libraries.length) return [];
    return libraries.filter((lib) => !lib.tenantId || lib.tenantId === tenantId);
  }, [libraries, tenantId]);

  useEffect(() => {
    if (!tenants.length) return;
    if (!tenants.some((tenant) => tenant.tenantId === tenantId)) {
      setTenantId(tenants[0].tenantId);
    }
  }, [tenants, tenantId]);

  useEffect(() => {
    if (!libraryOptions.length) return;
    if (!libraryOptions.some((lib) => lib.libraryId === libraryId)) {
      setLibraryId(libraryOptions[0].libraryId);
    }
  }, [libraryOptions, libraryId]);

  const uploadTask = useAsyncTask(
    async () => {
      const response = await uploadDocuments({
        files,
        title: title.trim() || undefined,
        titles: fileTitles,
        tenantId,
        libraryId
      });
      const list: UploadResult[] = Array.isArray(response?.items)
        ? response.items.map((item: any) => ({
            docId: item.docId ?? "",
            filename: item.filename ?? "",
            status: item.status ?? "uploaded",
            message: item.message
          }))
        : [];
      setResults(list);
      onUploaded();
      return list.length;
    },
    {
      loadingMessage: "正在上传并创建任务...",
      successMessage: (count) => `已创建 ${count} 个文档入库任务`,
      errorMessage: (error) => error.message
    }
  );

  useEffect(() => {
    const { phase, message } = uploadTask.status;
    if (phase === lastPhaseRef.current) return;
    lastPhaseRef.current = phase;

    if (phase === "error" && message) {
      toastPush({ title: "上传失败", description: message, tone: "danger" });
    }
    if (phase === "success" && message) {
      toastPush({ title: "上传完成", description: message, tone: "success" });
    }
  }, [uploadTask.status.phase, uploadTask.status.message, toastPush]);

  const handleFilesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const list = event.target.files ? Array.from(event.target.files) : [];
    setFiles(list);
    const generated = list.map((file) => deriveTitle(file.name));
    setFileTitles(generated);
    setResults([]);
    setTitle(generated[0] ?? "");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!files.length) {
      toastPush({ title: "请至少选择一个文件", tone: "warning" });
      return;
    }
    try {
      await uploadTask.run();
    } catch {
      // 错误已由 hook 处理 toast
    }
  };

  return (
    <GlassCard className="p-6 space-y-4">
      <SectionHeader
        eyebrow="入库"
        title="上传原始文档"
        description="选择租户/知识库后上传文件，系统自动生成标题与标签并创建 ingestion 任务。"
      />
      <div className="button-row compact">
        {optionLoading && <StatusPill tone="info">同步配置中</StatusPill>}
        {optionError && <StatusPill tone="danger">{optionError}</StatusPill>}
        {uploadTask.status.message && (
          <StatusPill tone={uploadTask.status.phase === "error" ? "danger" : "info"}>
            {uploadTask.status.message}
          </StatusPill>
        )}
      </div>
      <form onSubmit={handleSubmit} className="stacked-form">
        <div className="split">
          <Field label="租户">
            <select className={inputClass} value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
              {tenants.length ? (
                tenants.map((tenant) => (
                  <option key={tenant.tenantId} value={tenant.tenantId}>
                    {tenant.displayName ?? tenant.tenantId}
                  </option>
                ))
              ) : (
                <option value="default">default</option>
              )}
            </select>
          </Field>
          <Field label="知识库">
            <select className={inputClass} value={libraryId} onChange={(e) => setLibraryId(e.target.value)}>
              {libraryOptions.length ? (
                libraryOptions.map((lib) => (
                  <option key={lib.libraryId} value={lib.libraryId}>
                    {lib.displayName ?? lib.libraryId}
                  </option>
                ))
              ) : (
                <option value="default">default</option>
              )}
            </select>
          </Field>
        </div>

        {files.length <= 1 ? (
          <Field label="文档标题" hint="默认取文件名，可自行调整">
            <input
              className={inputClass}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setFileTitles((prev) => {
                  const next = [...prev];
                  next[0] = e.target.value;
                  return next;
                });
              }}
              required
              placeholder="示例：2024 协议"
            />
          </Field>
        ) : (
          <div className="stacked-form">
            <p className="muted-text">已选择 {files.length} 个文件，可单独调整标题：</p>
            {files.map((file, index) => (
              <Field key={`${file.name}-${index}`} label={file.name}>
                <input
                  className={inputClass}
                  value={fileTitles[index] ?? ""}
                  onChange={(e) =>
                    setFileTitles((prev) => {
                      const next = [...prev];
                      next[index] = e.target.value;
                      return next;
                    })
                  }
                  required
                />
              </Field>
            ))}
          </div>
        )}

        <small className="muted-text">标签会基于标题 + AI 自动生成，无需手填。</small>

        <Field label="文件">
          <input className={inputClass} type="file" multiple onChange={handleFilesChange} />
        </Field>

        {files.length > 0 && (
          <ul className="glass-card p-3 space-y-1">
            {files.map((file) => (
              <li key={file.name} className="text-sm text-slate-700">
                {file.name}
              </li>
            ))}
          </ul>
        )}

        <div className="button-row">
          <Button type="submit" disabled={uploadTask.status.phase === "loading"}>
            提交任务
          </Button>
          <Button type="button" variant="ghost" onClick={refresh}>
            刷新配置
          </Button>
        </div>
      </form>

      {results.length > 0 && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>文件</th>
                <th>Doc ID</th>
                <th>状态</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={`${result.docId}-${result.filename}`}>
                  <td>{result.filename}</td>
                  <td>{result.docId}</td>
                  <td>{result.status}</td>
                  <td>{result.message ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}
