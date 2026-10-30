import { useResource } from "@/hooks/use-api"
import { api, type DataPolicyConfig } from "@/lib/api"

const loadHealth = () => api.health()

/** The server's data policy (where the model runs, what may leave), from /healthz. */
export function useDataPolicy(): DataPolicyConfig | null {
  return useResource("health", loadHealth).data?.data_policy ?? null
}
