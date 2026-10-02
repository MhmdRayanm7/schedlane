import { useEffect } from "react";
import { useRouteError } from "react-router";
import { AppStatePage, StateLink } from "@/shared/components/app-state-page";
import { Button } from "@/shared/components/ui/button";

export function RouteErrorPage() {
  const error = useRouteError();

  useEffect(() => {
    if (import.meta.env.DEV) console.error("Route render failed", error);
  }, [error]);

  return (
    <AppStatePage
      title="Something went wrong"
      description="We couldn't load this page. Try again."
      primaryAction={
        <Button onClick={() => window.location.reload()}>Try again</Button>
      }
      secondaryAction={<StateLink to="/">Go to Schedlane</StateLink>}
    />
  );
}
