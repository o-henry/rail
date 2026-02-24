import type { ReactNode } from "react";

type FeedPageProps = {
  children: ReactNode;
};

export default function FeedPage({ children }: FeedPageProps) {
  return <section className="feed-layout workspace-tab-panel">{children}</section>;
}
