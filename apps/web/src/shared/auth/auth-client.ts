import { createAuthClient } from "better-auth/react";
import { apiBaseUrl } from "@/shared/api/config";

export const authClient = createAuthClient({
  baseURL: apiBaseUrl,
});
