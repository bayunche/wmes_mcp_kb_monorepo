import { VectorLogPanel } from "../components/VectorLogPanel";
import { StructureTree } from "../components/StructureTree";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/Card";
import { Activity } from "lucide-react";

export default function DiagnosticsPage() {
  return (

    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            实时诊断
          </CardTitle>
          <CardDescription>
            查看向量日志、OCR/语义处理记录，或输入 Doc ID 读取语义结构树来定位问题。适用于排查入库/检索异常，结合结构树查看分块层级，向量日志排查召回问题。
          </CardDescription>
        </CardHeader>
      </Card>
      <VectorLogPanel />
      <StructureTree />
    </div>
  );
}
