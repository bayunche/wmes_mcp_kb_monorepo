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
import { saveTenant } from "../api";
import { useToast } from "./ui/Toast";

interface CreateTenantDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: (tenantId: string) => void;
}

export function CreateTenantDialog({ open, onOpenChange, onSuccess }: CreateTenantDialogProps) {
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    const [tenantId, setTenantId] = useState("");
    const [displayName, setDisplayName] = useState("");

    useEffect(() => {
        if (open) {
            setTenantId(crypto.randomUUID());
            setDisplayName("");
        }
    }, [open]);

    const handleSubmit = async () => {
        if (!tenantId || !displayName) return;
        setLoading(true);
        try {
            await saveTenant({ tenantId, displayName });
            toast.push({ title: "租户已创建", tone: "success" });
            onSuccess?.(tenantId);
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
                    <DialogTitle>新建租户</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="tenantId">租户 ID (自动生成)</Label>
                        <Input
                            id="tenantId"
                            value={tenantId}
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
                            placeholder="例如: 某某公司"
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
