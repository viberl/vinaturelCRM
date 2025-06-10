import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "../lib/queryClient";

export interface CurrentUser {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
}

export function useCurrentUser() {
  return useQuery<CurrentUser | null>({
    queryKey: ["/api/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });
}
