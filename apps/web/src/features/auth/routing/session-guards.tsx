import { useEffect } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { authClient } from "@/shared/auth/auth-client";
import { BrandedLoadingState } from "../components/branded-loading-state";
import { safeReturnTo } from "./return-to";

export function RootRoute() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return <BrandedLoadingState />;

  return <Navigate replace to={session ? "/app" : "/login"} />;
}

export function GuestOnly() {
  const { data: session, isPending } = authClient.useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const signedOut = Boolean(
    (location.state as { signedOut?: boolean } | null)?.signedOut,
  );

  useEffect(() => {
    if (signedOut && !isPending && !session) {
      navigate("/login", { replace: true, state: null });
    }
  }, [isPending, navigate, session, signedOut]);

  if (isPending || signedOut) return <BrandedLoadingState />;
  if (session) {
    const searchParams = new URLSearchParams(location.search);
    return <Navigate replace to={safeReturnTo(searchParams.get("returnTo"))} />;
  }

  return <Outlet />;
}

export function RequireSession() {
  const { data: session, isPending } = authClient.useSession();
  const location = useLocation();

  if (isPending) return <BrandedLoadingState />;

  if (!session) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return (
      <Navigate
        replace
        to={`/login?returnTo=${encodeURIComponent(returnTo)}`}
      />
    );
  }

  return <Outlet />;
}
