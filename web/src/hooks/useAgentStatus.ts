import { useSyncExternalStore } from 'react';
import { agentStatusStore, type AgentState } from '../lib/agent-status-store';

export type { AgentState };

/**
 * Subscribe to the shared agent run-state. All consumers share a single
 * EventSource (with polling fallback) via agentStatusStore — see that module.
 */
export function useAgentStatus(): { state: AgentState; error: string | null } {
  return useSyncExternalStore(agentStatusStore.subscribe, agentStatusStore.getSnapshot);
}
