import { Component, type ErrorInfo, type ReactNode } from "react";
import MainApp from "./app/MainApp";

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
          <h2 style={{ margin: 0, fontSize: "16px" }}>렌더링 오류가 발생했습니다.</h2>
          <p style={{ margin: 0, fontSize: "13px", color: "#475569" }}>
            아래 오류 메시지를 복사해서 전달해 주세요.
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
            {this.state.message || "(메시지 없음)"}
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
            다시 로드
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <MainApp />
    </AppErrorBoundary>
  );
}
