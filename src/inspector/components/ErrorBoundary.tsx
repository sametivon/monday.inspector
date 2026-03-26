import React from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 16,
          textAlign: "center",
          color: "hsl(0 84% 60%)",
          fontSize: 12,
        }}>
          <div style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</div>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 12, wordBreak: "break-word" }}>
            {this.state.error.message}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              padding: "4px 12px",
              fontSize: 12,
              border: "1px solid #ccc",
              borderRadius: 4,
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
