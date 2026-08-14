import { Component } from "react";

export class AppErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("GENERAL SCREENER render failure", error, errorInfo);
  }

  retry = () => {
    this.props.onRetry?.();
  };

  lock = () => {
    this.props.onLock?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="runtime-error-screen">
        <section className="runtime-error-panel" role="alert" aria-labelledby="runtime-error-title">
          <p>RECOVERY MODE</p>
          <h1 id="runtime-error-title">화면을 불러오는 중 문제가 발생했습니다.</h1>
          <span>데이터는 변경되지 않았습니다. 다시 시도하거나 잠금 화면으로 돌아가세요.</span>
          <div className="runtime-error-actions">
            <button type="button" className="is-primary" onClick={this.retry}>다시 시도</button>
            <button type="button" onClick={this.lock}>잠금 화면으로</button>
          </div>
        </section>
      </main>
    );
  }
}
