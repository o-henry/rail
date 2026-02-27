import type { ReactNode } from "react";
import { localeShortLabel, useI18n } from "../i18n";

type WorkspaceTab = "dashboard" | "workflow" | "feed" | "bridge" | "settings";

type NavItem = {
  tab: WorkspaceTab;
  label: string;
  ariaLabel: string;
  title: string;
};

type AppNavProps = {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  renderIcon: (tab: WorkspaceTab, active: boolean) => ReactNode;
};

const NAV_ITEMS: NavItem[] = [
  { tab: "dashboard", label: "nav.dashboard", ariaLabel: "nav.dashboard", title: "nav.dashboard" },
  { tab: "workflow", label: "nav.workflow.short", ariaLabel: "nav.workflow.title", title: "nav.workflow.title" },
  { tab: "feed", label: "nav.feed", ariaLabel: "nav.feed", title: "nav.feed" },
  { tab: "bridge", label: "nav.bridge", ariaLabel: "nav.bridge", title: "nav.bridge" },
  { tab: "settings", label: "nav.settings", ariaLabel: "nav.settings", title: "nav.settings" },
];

export default function AppNav({ activeTab, onSelectTab, renderIcon }: AppNavProps) {
  const { locale, cycleLocale, t } = useI18n();
  return (
    <aside className="left-nav">
      <nav
        className="nav-list"
        style={{
          height: "100%",
          display: "grid",
        }}
      >
        {NAV_ITEMS.map((item) => {
          const active = activeTab === item.tab;
          return (
            <button
              aria-label={t(item.ariaLabel)}
              className={active ? "is-active" : ""}
              key={item.tab}
              onClick={() => onSelectTab(item.tab)}
              title={t(item.title)}
              type="button"
            >
              <span className="nav-icon">{renderIcon(item.tab, active)}</span>
              <span className="nav-label">{t(item.label)}</span>
            </button>
          );
        })}
      </nav>
      <div className="nav-footer">
        <button
          aria-label={t("nav.language")}
          className="nav-lang-button"
          onClick={cycleLocale}
          title={`${t("nav.language")} · ${t(`lang.${locale}`)}`}
          type="button"
        >
          <span className="nav-lang-code">{localeShortLabel(locale)}</span>
        </button>
      </div>
    </aside>
  );
}
