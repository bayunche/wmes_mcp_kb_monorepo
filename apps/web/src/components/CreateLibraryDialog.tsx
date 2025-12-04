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
import { saveLibrary } from "../api";
import { useToast } from "./ui/Toast";

interface CreateLibraryDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tenantId: string;
    onSuccess?: (libraryId: string) => void;
}

export function CreateLibraryDialog({ open, onOpenChange, tenantId, onSuccess }: CreateLibraryDialogProps) {
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    const [libraryId, setLibraryId] = useState("");
    const [displayName, setDisplayName] = useState("");

    useEffect(() => {
        if (open) {
            setLibraryId(crypto.randomUUID());
            setDisplayName("");
        }
    }, [open]);

    const handleSubmit = async () => {
        if (!libraryId || !displayName || !tenantId) return;
        setLoading(true);
        try {
            await saveLibrary({ libraryId, tenantId, displayName });
            toast.push({ title: "知识库已创建", tone: "success" });
            onSuccess?.(libraryId);
            onOpenChange(false);
        } catch (error) {
            toast.push({ title: "创建失败", description: (error as Error).message, tone: "danger" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>新建知识库</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="libraryId">知识库 ID (自动生成)</Label>
                        <Input
                            id="libraryId"
                            value={libraryId}
                            readOnly
                            className="bg-muted text-muted-foreground"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="displayName">显示名称</Label>
                        <Input
                            id="displayName"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="例如: 研发文档库"
                            autoFocus
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
                    <Button onClick={handleSubmit} disabled={loading || !displayName}>
                        {loading ? "创建中..." : "创建"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
