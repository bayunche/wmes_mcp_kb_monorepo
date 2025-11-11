import { useState } from "react";
import { UploadForm } from "./components/UploadForm";
import { SearchPanel } from "./components/SearchPanel";
import { MetadataEditor } from "./components/MetadataEditor";

export default function App() {
  const [refreshFlag, setRefreshFlag] = useState(0);
  return (
    <main>
      <header>
        <h1>KB 控制台</h1>
        <p>上传文档、运行 Pipeline、测试检索与编辑元数据。</p>
      </header>
      <div className="grid">
        <UploadForm onUploaded={() => setRefreshFlag((flag) => flag + 1)} />
        <SearchPanel key={refreshFlag} />
        <MetadataEditor key={`meta-${refreshFlag}`} />
      </div>
      <footer>
        <small>
          API 地址和 Token 可通过 `.env` / `.env.local` 设置 `VITE_API_BASE`、`VITE_API_TOKEN`。更多细节见 `README.md`。
        </small>
      </footer>
    </main>
  );
}
