import type { ReactNode } from "react";

type WorkspaceTab = "workflow" | "feed" | "bridge" | "settings";

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
  { tab: "workflow", label: "워크", ariaLabel: "워크플로우", title: "워크플로우" },
  { tab: "feed", label: "피드", ariaLabel: "피드", title: "피드" },
  { tab: "bridge", label: "웹 연결", ariaLabel: "웹 연결", title: "웹 연결" },
  { tab: "settings", label: "설정", ariaLabel: "설정", title: "설정" },
];

export default function AppNav({ activeTab, onSelectTab, renderIcon }: AppNavProps) {
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
              aria-label={item.ariaLabel}
              className={active ? "is-active" : ""}
              key={item.tab}
              onClick={() => onSelectTab(item.tab)}
              title={item.title}
              type="button"
            >
              <span className="nav-icon">{renderIcon(item.tab, active)}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
