import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { ApiError } from "@/shared/api/api-error";
import { authClient } from "@/shared/auth/auth-client";
import { BrandLockup } from "@/shared/brand/brand-lockup";
import { Button } from "@/shared/components/ui/button";
import { InlineAlert } from "@/shared/components/ui/inline-alert";
import { useAcceptInvitation, useInvitationPreview } from "../hooks/use-team";
import type { MembershipRole } from "../types";
import styles from "./accept-invitation.module.css";

function formatExpiration(isoString: string): string {
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  } catch {
    return isoString;
  }
}

function roleLabel(role: MembershipRole): string {
  switch (role) {
    case "owner":
      return "Owner";
    case "manager":
      return "Manager";
    case "staff":
      return "Staff";
  }
}

export function AcceptInvitationPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { refetch: refetchSession } = authClient.useSession();

  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const previewQuery = useInvitationPreview(token);
  const acceptMutation = useAcceptInvitation();

  async function handleUseAnotherAccount() {
    setIsSigningOut(true);
    try {
      await authClient.signOut();
      await refetchSession();
      queryClient.clear();
      const currentUrl = `${location.pathname}${location.search}`;
      navigate(`/login?returnTo=${encodeURIComponent(currentUrl)}`, {
        replace: true,
        state: { signedOut: true },
      });
    } catch {
      queryClient.clear();
      const currentUrl = `${location.pathname}${location.search}`;
      navigate(`/login?returnTo=${encodeURIComponent(currentUrl)}`, {
        replace: true,
        state: { signedOut: true },
      });
    } finally {
      setIsSigningOut(false);
    }
  }

  async function handleAccept() {
    if (!token || acceptMutation.isPending) return;

    setAcceptError(null);

    try {
      const result = await acceptMutation.mutateAsync(token);
      navigate(`/app/${result.organizationId}/bookings`, { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        switch (error.code) {
          case "ORGANIZATION_INVITATION_EMAIL_MISMATCH":
            setAcceptError(
              "This invitation was sent to a different email address.",
            );
            return;
          case "ORGANIZATION_INVITATION_NOT_FOUND":
            setAcceptError("This invitation could not be found.");
            return;
          case "ORGANIZATION_INVITATION_REVOKED":
            setAcceptError("This invitation has been revoked.");
            return;
          case "ORGANIZATION_INVITATION_EXPIRED":
            setAcceptError("This invitation has expired.");
            return;
          case "ORGANIZATION_INVITATION_ALREADY_ACCEPTED":
            setAcceptError("This invitation has already been accepted.");
            return;
          case "ORGANIZATION_MEMBER_ALREADY_EXISTS":
            setAcceptError("You are already a member of this organization.");
            return;
          case "INVITATION_RESOURCE_UNAVAILABLE":
          case "RESOURCE_NOT_FOUND":
          case "RESOURCE_DEACTIVATED":
          case "RESOURCE_ALREADY_LINKED":
          case "USER_RESOURCE_ALREADY_LINKED":
            setAcceptError(
              "The Resource assigned to this Staff invitation is no longer available.",
            );
            return;
          case "ORGANIZATION_ARCHIVED":
            setAcceptError(
              "This organization is archived and cannot accept new members.",
            );
            return;
          case "ORGANIZATION_SUSPENDED":
            setAcceptError(
              "This organization is suspended and cannot accept new members.",
            );
            return;
          default:
            setAcceptError(error.message || "Failed to accept invitation.");
            return;
        }
      }
      setAcceptError("An unexpected error occurred. Please try again.");
    }
  }

  // 1. Missing token state
  if (!token) {
    return (
      <main className={styles.layout}>
        <BrandLockup className={styles.brand} />
        <div className={styles.layoutContent}>
          <section className={styles.card}>
            <header className={styles.header}>
              <h1 className={styles.orgName}>Invalid invitation link</h1>
              <p className={styles.subtitle}>
                The invitation link is missing a valid token.
              </p>
            </header>
            <InlineAlert variant="error" className={styles.alert}>
              Please check the invitation link in your email and try again.
            </InlineAlert>
            <div className={styles.footerActions}>
              <Button
                variant="outline"
                className={styles.footerButton}
                onClick={() => navigate("/app")}
              >
                Go to workspace
              </Button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  // 2. Loading state
  if (previewQuery.isPending) {
    return (
      <main className={styles.layout}>
        <BrandLockup className={styles.brand} />
        <div className={styles.layoutContent}>
          <section className={styles.card}>
            <header className={styles.header}>
              <h1 className={styles.orgName}>Checking invitation…</h1>
              <p className={styles.subtitle}>
                Loading invitation details for your account.
              </p>
            </header>
          </section>
        </div>
      </main>
    );
  }

  // 3. Preview error states
  if (previewQuery.isError) {
    const error = previewQuery.error;
    const isEmailMismatch =
      error instanceof ApiError &&
      error.code === "ORGANIZATION_INVITATION_EMAIL_MISMATCH";

    if (isEmailMismatch) {
      return (
        <main className={styles.layout}>
          <BrandLockup className={styles.brand} />
          <div className={styles.layoutContent}>
            <section className={styles.card}>
              <header className={styles.header}>
                <h1 className={styles.orgName}>Wrong account</h1>
                <p className={styles.subtitle}>
                  This invitation belongs to another account.
                </p>
              </header>

              <InlineAlert variant="warning" className={styles.alert}>
                This invitation was sent to a different email address. Sign in
                with the account that received the invitation.
              </InlineAlert>

              <div className={styles.footerActions}>
                <Button
                  onClick={handleUseAnotherAccount}
                  loading={isSigningOut}
                  disabled={isSigningOut}
                  className={styles.footerButton}
                >
                  Use another account
                </Button>
                <Button
                  variant="outline"
                  className={styles.footerButton}
                  onClick={() => navigate("/app")}
                >
                  Go to workspace
                </Button>
              </div>
            </section>
          </div>
        </main>
      );
    }

    let errorTitle = "Unable to load invitation";
    let errorDescription =
      "We encountered an issue checking this invitation link.";

    if (error instanceof ApiError) {
      switch (error.code) {
        case "ORGANIZATION_INVITATION_NOT_FOUND":
          errorTitle = "Invitation not found";
          errorDescription =
            "This invitation link could not be found. It may have been revoked or entered incorrectly.";
          break;
        case "ORGANIZATION_INVITATION_REVOKED":
          errorTitle = "Invitation revoked";
          errorDescription =
            "This invitation has been revoked by an organization administrator.";
          break;
        case "ORGANIZATION_INVITATION_EXPIRED":
          errorTitle = "Invitation expired";
          errorDescription =
            "This invitation has expired. Ask an administrator to send you a new invitation.";
          break;
        case "ORGANIZATION_INVITATION_ALREADY_ACCEPTED":
          errorTitle = "Invitation already accepted";
          errorDescription =
            "This invitation has already been accepted. You can continue to your workspace.";
          break;
        case "ORGANIZATION_MEMBER_ALREADY_EXISTS":
          errorTitle = "Already a member";
          errorDescription = "You are already a member of this organization.";
          break;
        case "INVITATION_RESOURCE_UNAVAILABLE":
        case "RESOURCE_NOT_FOUND":
        case "RESOURCE_DEACTIVATED":
        case "RESOURCE_ALREADY_LINKED":
        case "USER_RESOURCE_ALREADY_LINKED":
          errorTitle = "Resource unavailable";
          errorDescription =
            "The Resource assigned to this Staff invitation is no longer available. Contact your organization administrator.";
          break;
        case "ORGANIZATION_ARCHIVED":
        case "ORGANIZATION_SUSPENDED":
          errorTitle = "Organization inactive";
          errorDescription =
            "This organization is currently inactive and cannot accept new members.";
          break;
      }
    }

    return (
      <main className={styles.layout}>
        <BrandLockup className={styles.brand} />
        <div className={styles.layoutContent}>
          <section className={styles.card}>
            <header className={styles.header}>
              <h1 className={styles.orgName}>{errorTitle}</h1>
              <p className={styles.subtitle}>{errorDescription}</p>
            </header>
            <div className={styles.footerActions}>
              <Button
                variant="outline"
                className={styles.footerButton}
                onClick={() => navigate("/app")}
              >
                Go to workspace
              </Button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  // 4. Successful preview display
  const preview = previewQuery.data;

  return (
    <main className={styles.layout}>
      <BrandLockup className={styles.brand} />
      <div className={styles.layoutContent}>
        <section className={styles.card}>
          <header className={styles.header}>
            <p className={styles.subtitle}>You're invited to join</p>
            <h1 className={styles.orgName}>{preview.organizationName}</h1>
          </header>

          <div className={styles.details}>
            <div className={styles.roleGroup}>
              <span className={styles.roleBadge}>
                {roleLabel(preview.role)}
              </span>
              {preview.role === "staff" && preview.resource ? (
                <span className={styles.resourceDetail}>
                  Resource:{" "}
                  <strong className={styles.resourceName}>
                    {preview.resource.name}
                  </strong>
                </span>
              ) : null}
            </div>

            <div className={styles.metaGroup}>
              <span>Invited by {preview.invitedByName}</span>
              <span>
                Invitation expires {formatExpiration(preview.expiresAt)}
              </span>
            </div>
          </div>

          {acceptError ? (
            <InlineAlert variant="error" className={styles.alert}>
              {acceptError}
            </InlineAlert>
          ) : null}

          <div className={styles.actions}>
            <Button
              className={styles.submitButton}
              onClick={handleAccept}
              loading={acceptMutation.isPending}
              disabled={acceptMutation.isPending}
            >
              Accept invitation
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
