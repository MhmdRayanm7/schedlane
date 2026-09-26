export function safeReturnTo(value: string | null | undefined): string {
  if (!value) return "/app";

  if (value.includes("\\") || value.startsWith("//")) {
    return "/app";
  }

  const isAppPath =
    value === "/app" || value.startsWith("/app/") || value.startsWith("/app?");
  const isInvitationAcceptPath =
    value === "/invitations/accept" || value.startsWith("/invitations/accept?");

  return isAppPath || isInvitationAcceptPath ? value : "/app";
}
