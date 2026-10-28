import type { UserPlan } from "@flowmemo/shared";
import {
  Bot,
  Check,
  Crown,
  Globe2,
  Hash,
  ImagePlus,
  ListChecks,
  Mail,
  Shuffle,
  Sparkles,
  X
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";

const SUBSCRIPTION_CONTACT_EMAIL = import.meta.env.VITE_SUBSCRIPTION_CONTACT_EMAIL?.trim() ?? "";

type SubscriptionPanelProps = {
  plan: UserPlan;
  onClose: () => void;
};

const subscriptionPlans: Array<{
  id: UserPlan;
  name: string;
  tagline: string;
  price: string;
  description: string;
  note: string;
  ctaLabel: string;
  benefits: Array<{ label: string; value: string; icon: ReactNode; }>;
}> = [
    {
      id: "free",
      name: "FREE",
      tagline: "轻量开始记录",
      price: "免费",
      description: "适合日常文字 memo 与基础整理。",
      note: "注册后默认可用",
      ctaLabel: "默认可用",
      benefits: [
        { label: "文字 memo", value: "无限记录", icon: <ListChecks size={17} /> },
        { label: "标签整理", value: "自动识别", icon: <Hash size={17} /> },
        { label: "随机漫游", value: "可用", icon: <Shuffle size={17} /> },
        { label: "公开分享", value: "可用", icon: <Globe2 size={17} /> },
      ],
    },
    {
      id: "member",
      name: "PRO",
      tagline: "记录更高效，回顾更从容",
      price: "联系开通",
      description: "加入图片上传与内置 AI，给长期记录更多空间。",
      note: "邮件联系开发者开通",
      ctaLabel: "联系开发者订阅",
      benefits: [
        { label: "包含 FREE 权益", value: "全部", icon: <Check size={17} /> },
        { label: "图片上传", value: "可用", icon: <ImagePlus size={17} /> },
        { label: "内置 AI", value: "可用", icon: <Bot size={17} /> },
        { label: "优先体验", value: "新功能", icon: <Sparkles size={17} /> },
      ],
    },
  ];

const proHighlights: Array<{ title: string; description: string; icon: ReactNode; }> = [
  {
    title: "图片进入记录流",
    description: "在 memo 里直接加入图片。",
    icon: <ImagePlus size={18} />,
  },
  {
    title: "内置 AI",
    description: "使用 FlowMemo 提供的 AI 模式。",
    icon: <Bot size={18} />,
  },
  {
    title: "优先体验",
    description: "新功能优先开放给 PRO。",
    icon: <Sparkles size={18} />,
  },
];

export function SubscriptionPanel({ plan, onClose }: SubscriptionPanelProps) {
  const [contactOpen, setContactOpen] = useState(false);

  function openContactEmail() {
    setContactOpen(true);
  }

  function openMailClient() {
    if (!SUBSCRIPTION_CONTACT_EMAIL) {
      toast.error("尚未配置联系邮箱");
      return;
    }
    const subject = encodeURIComponent("FlowMemo PRO 订阅开通");
    window.location.href = `mailto:${SUBSCRIPTION_CONTACT_EMAIL}?subject=${subject}`;
  }

  async function copyContactEmail() {
    if (!SUBSCRIPTION_CONTACT_EMAIL) {
      toast.error("尚未配置联系邮箱");
      return;
    }
    try {
      await navigator.clipboard.writeText(SUBSCRIPTION_CONTACT_EMAIL);
      toast.success("邮箱已复制");
    } catch {
      toast.error("复制失败，请手动复制邮箱");
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (contactOpen) {
          setContactOpen(false);
          return;
        }
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [contactOpen, onClose]);

  return (
    <div
      className="subscription-dialog-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="subscription-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscription-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="subscription-stars" />
        <header className="subscription-dialog-header">
          <div>
            <p className="subscription-kicker">权益与计划</p>
            <h2 id="subscription-dialog-title">flowmemo</h2>
          </div>
          <div className="subscription-dialog-actions">
            <span
              className="subscription-current-badge"
              data-plan={plan}
            >
              {plan === "member" ? <Crown size={15} /> : <Sparkles size={15} />}
              {plan === "member" ? "PRO 已开通" : "FREE 当前"}
            </span>
            <button
              type="button"
              className="subscription-dialog-close"
              aria-label="关闭权益与计划"
              title="关闭"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="subscription-awards">
          <span>编辑推荐</span>
          <span>专注推荐</span>
          <span>持续记录</span>
        </div>

        <div className="subscription-plan-grid">
          {subscriptionPlans.map((item) => {
            const active = plan === item.id;
            return (
              <section
                key={item.id}
                className="subscription-plan"
                data-plan={item.id}
                data-active={active ? "true" : undefined}
              >
                {item.id === "member" && (
                  <div className="subscription-featured-ribbon">
                    <Crown size={14} />
                    {active ? "当前 PRO" : "推荐"}
                  </div>
                )}
                <div className="subscription-plan-header">
                  <div>
                    <h3>{item.name}</h3>
                    <p className="subscription-plan-tagline">{item.tagline}</p>
                    <p>{item.description}</p>
                  </div>
                </div>
                <ul>
                  {item.benefits.map((benefit) => (
                    <li key={benefit.label}>
                      <span className="subscription-benefit-icon">{benefit.icon}</span>
                      <span>{benefit.label}</span>
                      <strong>{benefit.value}</strong>
                    </li>
                  ))}
                </ul>
                <div className="subscription-plan-footer">
                  <div className="subscription-plan-price">
                    <b>{item.price}</b>
                    <small>{item.note}</small>
                  </div>
                  {item.id === "member" ? (
                    <Button
                      type="button"
                      className="subscription-plan-cta"
                      variant={plan === "member" ? "ghost" : "primary"}
                      disabled={plan === "member"}
                      onClick={openContactEmail}
                    >
                      <Mail size={15} />
                      {plan === "member" ? "已订阅 PRO" : item.ctaLabel}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="subscription-plan-cta"
                      variant="secondary"
                      disabled
                    >
                      {item.ctaLabel}
                    </Button>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <div className="subscription-highlight-grid">
          {proHighlights.map((item) => (
            <section
              key={item.title}
              className="subscription-highlight"
            >
              <div>{item.icon}</div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </section>
          ))}
        </div>

        {contactOpen && (
          <div
            className="subscription-contact-backdrop"
            role="presentation"
            onMouseDown={() => setContactOpen(false)}
          >
            <section
              className="subscription-contact-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="subscription-contact-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="subscription-contact-close"
                aria-label="关闭"
                onClick={() => setContactOpen(false)}
              >
                <X size={16} />
              </button>
              <div className="subscription-contact-icon">
                <Mail size={22} />
              </div>
              <h3 id="subscription-contact-title">联系开发者开通 PRO</h3>
              <p>请发送邮件说明你的账号邮箱，开发者确认后会为你开通 PRO。</p>
              {SUBSCRIPTION_CONTACT_EMAIL ? (
                <a href={`mailto:${SUBSCRIPTION_CONTACT_EMAIL}`}>{SUBSCRIPTION_CONTACT_EMAIL}</a>
              ) : (
                <span>当前部署尚未配置联系邮箱。</span>
              )}
              <div className="subscription-contact-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={copyContactEmail}
                >
                  复制邮箱
                </Button>
                <Button
                  type="button"
                  onClick={openMailClient}
                >
                  打开邮件
                </Button>
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
