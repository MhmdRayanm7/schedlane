import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { authClient } from "@/shared/auth/auth-client";

export function useSignOut() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { refetch: refetchSession } = authClient.useSession();
  const [error, setError] = useState(false);
  const [isPending, setIsPending] = useState(false);

  async function signOut() {
    if (isPending) return;
    setError(false);
    setIsPending(true);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError(true);
        return;
      }
      await refetchSession();
      queryClient.clear();
      navigate("/login", { replace: true, state: { signedOut: true } });
    } catch {
      setError(true);
    } finally {
      setIsPending(false);
    }
  }

  return { error, isPending, signOut };
}
