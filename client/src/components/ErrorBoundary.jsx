import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error.message, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-screen flex items-center justify-center bg-claude-canvas">
          <div className="text-center px-6 max-w-sm">
            <p className="text-[15px] text-claude-body mb-2">出错了</p>
            <p className="text-[13px] text-claude-muted/60 mb-6 leading-relaxed">
              {this.state.error.message || "应用遇到意外错误"}
            </p>
            <button
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
              className="rounded-lg bg-claude-coral hover:bg-claude-coral-hover text-white text-[14px] font-medium px-5 py-2 transition-colors duration-200"
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
