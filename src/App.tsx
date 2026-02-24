import { Component, type ErrorInfo, type ReactNode } from "react";
import MainApp from "./app/MainApp";
import { I18nProvider, t } from "./i18n";

type AppErrorBoundaryState = {
  hasError: boolean;
  message: string;
  stack: string;
};

class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      message: "",
      stack: "",
    };
  }

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error && typeof error.stack === "string" ? error.stack : "",
    };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error("[app-error-boundary]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            alignContent: "start",
            gap: "10px",
            padding: "18px",
            background: "#f6f6f6",
            color: "#182030",
            fontFamily: "DialogNanumBody1984, Noto Sans KR, sans-serif",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "16px" }}>{t("app.error.title")}</h2>
          <p style={{ margin: 0, fontSize: "13px", color: "#475569" }}>
            {t("app.error.copy")}
          </p>
          <pre
            style={{
              margin: 0,
              padding: "10px 12px",
              borderRadius: "8px",
              background: "#ffffff",
              border: "1px solid #dbe2ea",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: "12px",
              lineHeight: 1.45,
            }}
          >
            {this.state.message || t("app.error.noMessage")}
            {this.state.stack ? `\n\n${this.state.stack}` : ""}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              width: "fit-content",
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              cursor: "pointer",
            }}
            type="button"
          >
            {t("app.error.reload")}
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <I18nProvider>
      <AppErrorBoundary>
        <MainApp />
      </AppErrorBoundary>
    </I18nProvider>
  );
}
