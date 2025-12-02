import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "./ui/Dialog";
import { Button } from "./ui/Button";
import { Label } from "./ui/Label";
import { Input } from "./ui/Input";
import { Badge } from "./ui/Badge";
import { updateChunkMetadata } from "../api";
import { useToast } from "./ui/Toast";
import { ScrollArea } from "./ui/ScrollArea";

interface ChunkEditDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    chunk: {
        chunkId: string;
        semanticTitle?: string;
        topicLabels?: string[];
        semanticTags?: string[];
        keywords?: string[];
        contextSummary?: string;
        parentSectionPath?: string[];
    } | null;
    onSuccess?: () => void;
}

export function ChunkEditDialog({ open, onOpenChange, chunk, onSuccess }: ChunkEditDialogProps) {
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        semanticTitle: "",
        topicLabels: "",
        semanticTags: "",
        keywords: "",
        contextSummary: "",
        parentSectionPath: "",
    });

    useEffect(() => {
        if (chunk && open) {
            setFormData({
                semanticTitle: chunk.semanticTitle ?? "",
                topicLabels: (chunk.topicLabels ?? []).join(", "),
                semanticTags: (chunk.semanticTags ?? []).join(", "),
                keywords: (chunk.keywords ?? []).join(", "),
                contextSummary: chunk.contextSummary ?? "",
                parentSectionPath: (chunk.parentSectionPath ?? []).join(" / "),
            });
        }
    }, [chunk, open]);

    const handleSubmit = async () => {
        if (!chunk) return;
        setLoading(true);
        try {
            await updateChunkMetadata(chunk.chunkId, {
                semanticTitle: formData.semanticTitle,
                topicLabels: formData.topicLabels.split(/[,，]/).map(s => s.trim()).filter(Boolean),
                semanticTags: formData.semanticTags.split(/[,，]/).map(s => s.trim()).filter(Boolean),
                keywords: formData.keywords.split(/[,，]/).map(s => s.trim()).filter(Boolean),
                contextSummary: formData.contextSummary,
                parentSectionPath: formData.parentSectionPath.split("/").map(s => s.trim()).filter(Boolean),
            });
            toast.push({ title: "更新成功", tone: "success" });
            onSuccess?.();
            onOpenChange(false);
        } catch (error) {
            toast.push({ title: "更新失败", description: (error as Error).message, tone: "danger" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>编辑 Chunk 元数据</DialogTitle>
                </DialogHeader>
                <ScrollArea className="flex-1 pr-4 -mr-4">
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="semanticTitle">语义标题</Label>
                            <Input
                                id="semanticTitle"
                                value={formData.semanticTitle}
                                onChange={(e) => setFormData({ ...formData, semanticTitle: e.target.value })}
                                placeholder="Chunk 的语义化标题"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="topicLabels">Topic 标签 (逗号分隔)</Label>
                            <Input
                                id="topicLabels"
                                value={formData.topicLabels}
                                onChange={(e) => setFormData({ ...formData, topicLabels: e.target.value })}
                                placeholder="例如: 财务, 报销"
                            />
                            <div className="flex flex-wrap gap-1">
                                {formData.topicLabels.split(/[,，]/).map(s => s.trim()).filter(Boolean).map((tag, i) => (
                                    <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                                ))}
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="semanticTags">语义标签 (逗号分隔)</Label>
                            <Input
                                id="semanticTags"
                                value={formData.semanticTags}
                                onChange={(e) => setFormData({ ...formData, semanticTags: e.target.value })}
                                placeholder="例如: 重要, 待办"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="keywords">关键词 (逗号分隔)</Label>
                            <Input
                                id="keywords"
                                value={formData.keywords}
                                onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="parentSectionPath">父路径 (/ 分隔)</Label>
                            <Input
                                id="parentSectionPath"
                                value={formData.parentSectionPath}
                                onChange={(e) => setFormData({ ...formData, parentSectionPath: e.target.value })}
                                placeholder="例如: 第一章 / 第二节"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="contextSummary">上下文摘要</Label>
                            <textarea
                                id="contextSummary"
                                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={formData.contextSummary}
                                onChange={(e) => setFormData({ ...formData, contextSummary: e.target.value })}
                            />
                        </div>
                    </div>
                </ScrollArea>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
                    <Button onClick={handleSubmit} disabled={loading}>
                        {loading ? "保存中..." : "保存"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
