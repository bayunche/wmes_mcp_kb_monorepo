import { IngestionStatusPanel } from "../components/IngestionStatusPanel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Activity } from "lucide-react";

export default function QueueMonitorPage() {
  return (

    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              <span>入库队列监控</span>
            </div>
            <Badge variant="outline" className="font-normal">
              实时刷新
            </Badge>
          </CardTitle>
          <CardDescription>
            解析 / 切分 / 元数据 / 向量化 / 持久化 全链路进度。表格展示最新入库任务，含阶段进度条；点击重试/重建索引可快速处理异常。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IngestionStatusPanel />
        </CardContent>
      </Card>
    </div>
  );
}
