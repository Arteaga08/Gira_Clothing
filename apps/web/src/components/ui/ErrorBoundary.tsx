"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Wraps a section that fetches (M7+) so one failed request dims that section
 * instead of taking down the whole page. Class component: this is the one
 * case React still requires it — there is no hook equivalent for
 * componentDidCatch.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  // Intentional: this is the panel's last line of visibility into a render crash.
  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ErrorBoundary capturó un error:", error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export type { ErrorBoundaryProps };
export { ErrorBoundary };
