import { Component, type ErrorInfo, type ReactNode } from "react";
import { AppStatePage } from "@/shared/components/app-state-page";
import { Button } from "@/shared/components/ui/button";

type Props = { children: ReactNode };
type State = { failed: boolean };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV)
      console.error("Application render failed", error, info);
  }

  render() {
    if (this.state.failed) {
      return (
        <AppStatePage
          title="Something went wrong"
          description="We couldn't load Schedlane. Reload the application to try again."
          primaryAction={
            <Button onClick={() => window.location.reload()}>
              Reload Schedlane
            </Button>
          }
        />
      );
    }

    return this.props.children;
  }
}
