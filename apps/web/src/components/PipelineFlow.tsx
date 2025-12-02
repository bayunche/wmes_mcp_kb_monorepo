import { ModelSettingView } from "../api";

interface PipelineFlowProps {
    settings: Record<string, ModelSettingView>;
    onSelectRole: (role: string) => void;
    currentRole: string;
}

const STEPS = [
    {
        id: "structure",
        label: "语义切分",
        icon: "✂️",
        desc: "解析文档结构",
        required: true
    },
    {
        id: "tagging",
        label: "标签补全",
        icon: "🏷️",
        desc: "生成元数据",
        required: false
    },
    {
        id: "embedding",
        label: "文本向量",
        icon: "🧠",
        desc: "生成语义索引",
        required: true
    },
    {
        id: "rerank",
        label: "重排序",
        icon: "⚖️",
        desc: "提升检索精度",
        required: true
    }
];

export function PipelineFlow({ settings, onSelectRole, currentRole }: PipelineFlowProps) {
    return (
        <div className="relative py-6">
            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-200 -z-10 transform -translate-y-1/2" />
            <div className="flex justify-between items-start">
                {STEPS.map((step, index) => {
                    const isConfigured = !!settings[step.id];
                    const isActive = currentRole === step.id;

                    return (
                        <div key={step.id} className="flex flex-col items-center gap-2 group cursor-pointer" onClick={() => onSelectRole(step.id)}>
                            <div
                                className={`
                  w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-sm border-2 transition-all
                  ${isActive ? "border-blue-500 bg-blue-50 scale-110" : isConfigured ? "border-green-500 bg-white" : "border-slate-300 bg-slate-50"}
                `}
                            >
                                {step.icon}
                            </div>
                            <div className="text-center">
                                <div className={`font-medium text-sm ${isActive ? "text-blue-600" : "text-slate-700"}`}>
                                    {step.label}
                                </div>
                                <div className="text-xs text-slate-500">{step.desc}</div>
                                <div className={`text-[10px] mt-1 px-1.5 py-0.5 rounded-full inline-block ${isConfigured ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                                    {isConfigured ? "已配置" : step.required ? "待配置" : "可选"}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
