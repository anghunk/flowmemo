import {
  Bot
} from "lucide-react";
import { useAiEntitlement } from "../../hooks/useAi";

export function AiComingSoonPanel() {
  const entitlement = useAiEntitlement();
  const modes = entitlement.data?.availableModes ?? ["custom"];

  return (
    <section className="ai-coming-soon-panel">
      <div className="ai-coming-soon-icon">
        <Bot size={26} />
      </div>
      <p className="ai-mode-pill">{modes.includes("hosted") ? "内置 AI + 自定义模型" : "自定义模型"}</p>
      <h2>功能正在开发中</h2>
      <p>敬请期待</p>
    </section>
  );
}
