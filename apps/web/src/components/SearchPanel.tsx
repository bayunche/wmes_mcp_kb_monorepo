import { useEffect, useMemo, useState } from "react";
import { buildAttachmentUrl, previewChunk, relatedChunks, searchDocuments } from "../api";
import { useOrgOptions } from "../hooks/useOrgOptions";
import { useAsyncTask } from "../hooks/useAsyncTask";
import { useToast } from "./ui/Toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/Card";
import { Input } from "./ui/Input";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/Select";
import { Label } from "./ui/Label";
import { Skeleton } from "./ui/Skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/Dialog";
import { ScrollArea } from "./ui/ScrollArea";
import { Separator } from "./ui/Separator";
import {
  Search,
  RefreshCw,
  FileText,
  Paperclip,
  Maximize2,
  Link as LinkIcon,
  ExternalLink,
  Tags,
  Layers,
  Hash,
  Filter
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./ui/Alert";

type SearchResult = {
  chunk: {
    chunkId: string;
    docId?: string;
    hierPath?: string[];
    contentText?: string;
    sourceUri?: string;
    semanticTags?: string[];
    topics?: string[];
    semanticMetadata?: {
      contextSummary?: string;
      semanticTags?: string[];
      envLabels?: string[];
      topics?: string[];
      keywords?: string[];
      entities?: Array<{ name: string; type?: string }>;
      parentSectionPath?: string[];
      title?: string;
    };
  };
  document?: {
    docId: string;
    title?: string;
    tags?: string[];
    ingestStatus?: string;
    sourceUri?: string;
    libraryId?: string;
  };
  attachments?: any[];
  score?: number;
};

export default function SearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [preview, setPreview] = useState<any | null>(null);
  const [related, setRelated] = useState<any[]>([]);
  const [modalChunk, setModalChunk] = useState<SearchResult | null>(null);
  const [tenantId, setTenantId] = useState("default");
  const [libraryId, setLibraryId] = useState("default");
  const [semanticTags, setSemanticTags] = useState("");
  const [envLabels, setEnvLabels] = useState("");
  const [metadataKey, setMetadataKey] = useState("");
  const [metadataValue, setMetadataValue] = useState("");
  const [onlyWithAttachments, setOnlyWithAttachments] = useState(false);
  const { tenants, libraries, loading: orgLoading, error: orgError, refresh: refreshOrgOptions } = useOrgOptions();
  const toast = useToast();

  useEffect(() => {
    if (!tenants.length) return;
    if (!tenants.some((tenant) => tenant.tenantId === tenantId)) {
      setTenantId(tenants[0].tenantId);
    }
  }, [tenants, tenantId]);

  useEffect(() => {
    if (!libraries.length) return;
    const scoped = libraries.filter((lib) => !lib.tenantId || lib.tenantId === tenantId);
    if (scoped.length && !scoped.some((lib) => lib.libraryId === libraryId)) {
      setLibraryId(scoped[0].libraryId);
    }
  }, [libraries, tenantId, libraryId]);

  const searchTask = useAsyncTask(
    async () => {
      const filters: Record<string, unknown> = { libraryId };
      if (semanticTags.trim()) filters.semanticTags = semanticTags.split(",").map((t) => t.trim()).filter(Boolean);
      if (envLabels.trim()) filters.envLabels = envLabels.split(",").map((t) => t.trim()).filter(Boolean);
      if (metadataKey.trim() && metadataValue.trim()) filters[metadataKey.trim()] = metadataValue.trim();
      if (onlyWithAttachments) filters.hasAttachments = true;
      const response = await searchDocuments({ query, limit: 8, filters, includeNeighbors: true }, libraryId);
      setResults(response.results ?? []);
      setPreview(null);
      setRelated([]);
      return response.total ?? response.results?.length ?? 0;
    },
    {
      loadingMessage: "检索中...",
      successMessage: (total) => `共 ${total} 条结果`,
      errorMessage: (error) => error.message
    }
  );

  const previewTask = useAsyncTask(
    async (chunkId: string) => {
      const response = await previewChunk(chunkId, libraryId || "default");
      setPreview(response);
    },
    {
      loadingMessage: "加载预览...",
      errorMessage: (error) => error.message
    }
  );

  const relatedTask = useAsyncTask(
    async (chunkId: string) => {
      const response = await relatedChunks(chunkId, 5, libraryId || "default");
      setRelated(response.related ?? []);
      return response.related?.length ?? 0;
    },
    {
      loadingMessage: "加载相关段落...",
      successMessage: (total) => `找到 ${total} 条相关段落`,
      errorMessage: (error) => error.message
    }
  );

  const statusTone = useMemo(() => (searchTask.status.phase === "error" ? "destructive" : "default"), [searchTask.status.phase]);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    await searchTask.run();
  };

  const handlePreview = async (chunkId: string) => {
    try {
      await previewTask.run(chunkId);
    } catch (error) {
      toast.push({ title: "预览失败", description: (error as Error).message, tone: "danger" });
    }
  };

  const handleRelated = async (chunkId: string) => {
    try {
      await relatedTask.run(chunkId);
    } catch (error) {
      toast.push({ title: "关联段落失败", description: (error as Error).message, tone: "danger" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Header & Filters */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center justify-between">
            <span>语义检索工作台</span>
            {searchTask.status.message && (
              <Badge variant={statusTone as any} className="text-xs font-normal">
                {searchTask.status.message}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Hybrid 检索 · 预览 · 关联段落。支持元数据筛选、Chunk 预览与关联段落，便于验证召回质量。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="输入检索词，例如：合同违约责任..."
                  required
                />
              </div>
              <Button type="submit" disabled={searchTask.status.phase === "loading"}>
                {searchTask.status.phase === "loading" ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                检索
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>租户</Label>
                <Select value={tenantId} onValueChange={setTenantId}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择租户" />
                  </SelectTrigger>
                  <SelectContent>
                    {(tenants.length ? tenants : [{ tenantId: "default", displayName: "default" }]).map((item) => (
                      <SelectItem key={item.tenantId} value={item.tenantId}>
                        {item.displayName ?? item.tenantId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>知识库</Label>
                <Select value={libraryId} onValueChange={setLibraryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择知识库" />
                  </SelectTrigger>
                  <SelectContent>
                    {(libraries.length ? libraries : [{ libraryId: "default", displayName: "default" }])
                      .filter((lib) => !lib.tenantId || lib.tenantId === tenantId)
                      .map((lib) => (
                        <SelectItem key={lib.libraryId} value={lib.libraryId}>
                          {lib.displayName ?? lib.libraryId}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>语义标签</Label>
                <Input
                  value={semanticTags}
                  onChange={(e) => setSemanticTags(e.target.value)}
                  placeholder="合规, 财报"
                />
              </div>
              <div className="space-y-2">
                <Label>环境标签</Label>
                <Input
                  value={envLabels}
                  onChange={(e) => setEnvLabels(e.target.value)}
                  placeholder="prod, cn"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1 grid grid-cols-2 gap-2 max-w-md">
                <Input
                  value={metadataKey}
                  onChange={(e) => setMetadataKey(e.target.value)}
                  placeholder="元数据键 (Key)"
                />
                <Input
                  value={metadataValue}
                  onChange={(e) => setMetadataValue(e.target.value)}
                  placeholder="元数据值 (Value)"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="hasAttachments"
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  checked={onlyWithAttachments}
                  onChange={(e) => setOnlyWithAttachments(e.target.checked)}
                />
                <Label htmlFor="hasAttachments" className="cursor-pointer">仅含附件</Label>
              </div>
              <div className="ml-auto">
                <Button type="button" variant="ghost" size="sm" onClick={refreshOrgOptions}>
                  <RefreshCw className="mr-2 h-3 w-3" />
                  刷新配置
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-[1fr_400px] xl:grid-cols-[1fr_450px]">
        {/* Left: Results List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold tracking-tight">检索结果</h3>
            <span className="text-sm text-muted-foreground">
              {results.length ? `Top ${results.length}` : "暂无结果"}
            </span>
          </div>

          <div className="space-y-3">
            {searchTask.status.phase === "loading" ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <Card key={`skeleton-${idx}`}>
                  <CardContent className="p-4 space-y-3">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardContent>
                </Card>
              ))
            ) : results.length > 0 ? (
              results.map((item) => (
                <Card
                  key={item.chunk.chunkId}
                  className={`cursor-pointer transition-all hover:border-primary/50 ${preview?.chunkId === item.chunk.chunkId ? "border-primary ring-1 ring-primary" : ""
                    }`}
                  onClick={() => handlePreview(item.chunk.chunkId)}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Layers className="h-3 w-3" />
                          <span>{item.chunk.hierPath?.join(" / ") ?? "暂无层级"}</span>
                        </div>
                        <h4 className="font-medium leading-none">
                          {item.document?.title ?? item.chunk.chunkId}
                        </h4>
                      </div>
                      <div className="flex flex-wrap gap-1 justify-end max-w-[120px]">
                        {item.document?.tags?.map((tag) => (
                          <Badge key={`${item.chunk.chunkId}-${tag}`} variant="secondary" className="text-[10px] px-1 py-0">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                      {item.chunk.semanticMetadata?.contextSummary ?? item.chunk.contentText?.slice(0, 180)}
                    </p>

                    <div className="flex flex-wrap gap-1">
                      {(item.chunk.semanticMetadata?.semanticTags ?? item.chunk.semanticTags ?? []).slice(0, 5).map((tag) => (
                        <Badge key={`${item.chunk.chunkId}-${tag}`} variant="outline" className="text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                      {(item.chunk.semanticMetadata?.topics ?? item.chunk.topics ?? []).slice(0, 3).map((tag) => (
                        <Badge key={`${item.chunk.chunkId}-topic-${tag}`} variant="secondary" className="text-[10px] bg-slate-100 text-slate-600">
                          {tag}
                        </Badge>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t mt-2">
                      <span className="text-xs text-muted-foreground font-mono">
                        {item.document?.libraryId ?? libraryId}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setModalChunk(item);
                          }}
                        >
                          <Maximize2 className="mr-1 h-3 w-3" />
                          详情
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRelated(item.chunk.chunkId);
                          }}
                        >
                          <LinkIcon className="mr-1 h-3 w-3" />
                          关联 ({item.score?.toFixed(3)})
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center py-12 text-muted-foreground bg-slate-50 rounded-lg border border-dashed">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p>暂无搜索结果，请输入查询词后执行检索。</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Preview & Related */}
        <div className="space-y-6">
          <Card className="h-fit sticky top-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                预览
              </CardTitle>
              <CardDescription>上下文 / 附件</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {previewTask.status.phase === "loading" ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : preview ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-sm">
                      {preview.semanticMetadata?.title ?? preview.semanticTitle ?? preview.title ?? preview.chunkId}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      {preview.hierPath?.join(" / ") ?? "-"}
                    </p>
                  </div>

                  <div className="bg-muted/30 p-3 rounded-md text-sm leading-relaxed text-foreground/90 max-h-[300px] overflow-y-auto">
                    {preview.semanticMetadata?.contextSummary ?? preview.contentText}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {(preview.semanticMetadata?.semanticTags ?? preview.semanticTags ?? []).map((tag: string) => (
                      <Badge key={`${preview.chunkId}-preview-tag-${tag}`} variant="outline" className="text-[10px]">
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  {preview.attachments?.length ? (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">附件</Label>
                      <div className="flex flex-wrap gap-2">
                        {preview.attachments.map((att: any) => (
                          <a
                            key={att.assetId}
                            href={buildAttachmentUrl(att)}
                            className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs hover:bg-blue-100 transition-colors"
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Paperclip className="h-3 w-3" />
                            <span className="max-w-[120px] truncate">{att.objectKey}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  点击左侧结果查看详情
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <LinkIcon className="h-4 w-4" />
                相关段落
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {relatedTask.status.phase === "loading" ? (
                Array.from({ length: 3 }).map((_, idx) => (
                  <div key={`related-skeleton-${idx}`} className="space-y-2">
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ))
              ) : related.length > 0 ? (
                related.map((item) => (
                  <div key={item.chunk.chunkId} className="p-3 bg-muted/30 rounded-md space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-xs truncate max-w-[200px]">
                        {item.document?.title ?? item.chunk.chunkId}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {item.score?.toFixed(3)}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground line-clamp-3 text-xs">
                      {item.chunk.contentText}
                    </p>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  暂无相关段落
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Detail Modal */}
      <Dialog open={!!modalChunk} onOpenChange={(open) => !open && setModalChunk(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chunk 详情</DialogTitle>
            <DialogDescription>
              {modalChunk?.chunk.hierPath?.join(" / ") ?? "-"} · {modalChunk?.document?.title ?? modalChunk?.chunk.docId}
            </DialogDescription>
          </DialogHeader>

          {modalChunk && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h3 className="font-semibold text-lg">
                  {modalChunk.chunk.semanticMetadata?.title ??
                    modalChunk.chunk.semanticMetadata?.contextSummary?.slice(0, 24) ??
                    modalChunk.chunk.chunkId}
                </h3>
                <div className="flex flex-wrap gap-1">
                  {(modalChunk.chunk.semanticMetadata?.semanticTags ?? []).map((tag) => (
                    <Badge key={`${modalChunk.chunk.chunkId}-tag-${tag}`} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                  {(modalChunk.chunk.semanticMetadata?.topics ?? []).map((tag) => (
                    <Badge key={`${modalChunk.chunk.chunkId}-topic-${tag}`} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>

              {modalChunk.chunk.semanticMetadata?.contextSummary && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">上下文摘要</Label>
                  <div className="bg-muted/50 p-4 rounded-lg text-sm leading-relaxed">
                    {modalChunk.chunk.semanticMetadata.contextSummary}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">原始内容</Label>
                <div className="bg-muted p-4 rounded-lg text-sm font-mono whitespace-pre-wrap leading-relaxed">
                  {modalChunk.chunk.contentText}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {modalChunk.chunk.semanticMetadata?.keywords?.length && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">关键词</Label>
                    <div className="flex flex-wrap gap-1">
                      {modalChunk.chunk.semanticMetadata.keywords.map((kw) => (
                        <Badge key={`${modalChunk.chunk.chunkId}-kw-${kw}`} variant="outline" className="text-xs">
                          {kw}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {modalChunk.chunk.semanticMetadata?.entities?.length && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">实体</Label>
                    <div className="flex flex-wrap gap-1">
                      {modalChunk.chunk.semanticMetadata.entities.map((e) => (
                        <Badge key={`${modalChunk.chunk.chunkId}-entity-${e.name}`} variant="outline" className="text-xs border-yellow-200 bg-yellow-50 text-yellow-800">
                          {e.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {modalChunk.attachments?.length && (
                <div className="space-y-2 pt-4 border-t">
                  <Label>附件</Label>
                  <div className="flex flex-wrap gap-2">
                    {modalChunk.attachments.map((att: any) => (
                      <a
                        key={att.assetId}
                        href={buildAttachmentUrl(att)}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-md text-sm hover:bg-blue-100 transition-colors"
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Paperclip className="h-4 w-4" />
                        <span>{att.objectKey}</span>
                        <ExternalLink className="h-3 w-3 opacity-50" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
