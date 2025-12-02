import { Link, useLocation } from "react-router-dom";
import { Brain, Database, FileText, Search, Settings, Menu } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./ui/Button";
import { useOrgOptions } from "../hooks/useOrgOptions";
import { useState, useEffect } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./ui/Select";

interface MainLayoutProps {
    children: React.ReactNode;
}

const NAV_ITEMS = [
    { label: "模型配置", icon: Brain, href: "/settings/models" },
    { label: "数据入库", icon: Database, href: "/ingestion" },
    { label: "知识资产", icon: FileText, href: "/documents" },
    { label: "检索对话", icon: Search, href: "/search" },
];

export function MainLayout({ children }: MainLayoutProps) {
    const location = useLocation();
    const { tenants, libraries } = useOrgOptions();
    const [tenantId, setTenantId] = useState("default");
    const [libraryId, setLibraryId] = useState("default");

    // Sync global context (mock implementation for now, ideally use a Context)
    useEffect(() => {
        // In a real app, this would update a global context
        console.log("Global Context Changed:", { tenantId, libraryId });
    }, [tenantId, libraryId]);

    return (
        <div className="min-h-screen bg-slate-50 flex">
            {/* Sidebar */}
            <aside className="w-64 bg-white border-r border-slate-200 flex flex-col fixed h-full z-10">
                <div className="h-16 flex items-center px-6 border-b border-slate-100">
                    <div className="font-bold text-xl text-slate-900 flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                            <Brain className="w-5 h-5" />
                        </div>
                        <span>AI Knowledge</span>
                    </div>
                </div>

                <div className="p-4 space-y-4 flex-1">
                    <div className="space-y-1">
                        <div className="px-3 text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                            Context
                        </div>
                        <Select value={tenantId} onValueChange={setTenantId}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select Tenant" />
                            </SelectTrigger>
                            <SelectContent>
                                {(tenants.length ? tenants : [{ tenantId: "default", displayName: "Default Tenant" }]).map((t) => (
                                    <SelectItem key={t.tenantId} value={t.tenantId}>
                                        {t.displayName || t.tenantId}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={libraryId} onValueChange={setLibraryId}>
                            <SelectTrigger className="w-full mt-2">
                                <SelectValue placeholder="Select Library" />
                            </SelectTrigger>
                            <SelectContent>
                                {(libraries.length ? libraries : [{ libraryId: "default", displayName: "Default Library" }])
                                    .filter((l) => !l.tenantId || l.tenantId === tenantId)
                                    .map((l) => (
                                        <SelectItem key={l.libraryId} value={l.libraryId}>
                                            {l.displayName || l.libraryId}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <nav className="space-y-1">
                        <div className="px-3 text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 mt-6">
                            Menu
                        </div>
                        {NAV_ITEMS.map((item) => {
                            const isActive = location.pathname.startsWith(item.href);
                            return (
                                <Link
                                    key={item.href}
                                    to={item.href}
                                    className={cn(
                                        "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                                        isActive
                                            ? "bg-blue-50 text-blue-700"
                                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                    )}
                                >
                                    <item.icon className={cn("w-4 h-4", isActive ? "text-blue-600" : "text-slate-400")} />
                                    {item.label}
                                </Link>
                            );
                        })}
                    </nav>
                </div>

                <div className="p-4 border-t border-slate-100">
                    <Button variant="ghost" className="w-full justify-start gap-3 text-slate-600">
                        <Settings className="w-4 h-4" />
                        System Settings
                    </Button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 ml-64 min-w-0">
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-10">
                    <div className="flex items-center gap-4 text-sm text-slate-500">
                        <span className="font-medium text-slate-900">
                            {NAV_ITEMS.find((i) => location.pathname.startsWith(i.href))?.label || "Dashboard"}
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        <Button variant="outline" size="sm">
                            Help & Docs
                        </Button>
                        <div className="w-8 h-8 rounded-full bg-slate-200" />
                    </div>
                </header>
                <div className="p-8 max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
