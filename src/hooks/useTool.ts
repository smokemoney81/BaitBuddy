/**
 * Hook for querying tool registry and checking access permissions
 *
 * Usage:
 *   const { getAccessibleTools, isToolAccessible } = useTool();
 *   const allAccessibleTools = getAccessibleTools();
 *   const canUseBuddyVoice = isToolAccessible('voice-buddy');
 */

import { useMemo } from 'react';
import { ToolRegistry, type ToolDefinition, type PlanLevel } from '@/lib/toolRegistry';
import { usePlan } from '@/components/premium/PlanContext';

export interface UseToolResult {
  // Get all tools accessible to the current user
  getAccessibleTools: () => ToolDefinition[];

  // Check if a specific tool is accessible to the current user
  isToolAccessible: (toolId: string) => boolean;

  // Get tool by ID
  getTool: (toolId: string) => ToolDefinition | undefined;

  // Get tool by its React Router route (e.g. '/Logbook')
  getToolByRoute: (route: string) => ToolDefinition | undefined;

  // Get tools by category that are accessible
  getAccessibleToolsByCategory: (category: string) => ToolDefinition[];

  // Get current user's plan level
  getUserPlanLevel: () => PlanLevel;
}

// Der Plan kommt aus dem PlanContext (gespeist von GET /api/premium/status).
// Zuvor las dieser Hook `useAuth().plan` — ein Feld, das der AuthContext gar
// nicht bereitstellt. `plan` war deshalb IMMER undefined und jeder Nutzer galt
// als 'free', auch ein zahlender Ultimate-Kunde. Genau der Fehler, den der
// Release-Audit als "Ultimate darf Premium-Tools nicht faelschlich sperren"
// fuehrt.
const PLAN_LEVELS: Record<string, PlanLevel> = {
  free: 'free',
  basic: 'basic',
  pro: 'pro',
  elite: 'elite',
  ultimate: 'ultimate',
  friends: 'friends',
  friends_monthly: 'elite',
  trial_10_10: 'ultimate',
};

export function useTool(): UseToolResult {
  const { plan } = usePlan();

  const userPlan = useMemo<PlanLevel>(
    () => PLAN_LEVELS[plan?.id ?? ''] ?? 'free',
    [plan?.id]
  );

  const getAccessibleTools = useMemo(
    () => () => ToolRegistry.getToolsByPlanLevel(userPlan),
    [userPlan]
  );

  const isToolAccessible = useMemo(
    () => (toolId: string) => {
      const tool = ToolRegistry.getToolById(toolId);
      if (!tool) return false;
      return ToolRegistry.isToolAccessible(tool, userPlan);
    },
    [userPlan]
  );

  const getTool = useMemo(
    () => (toolId: string) => ToolRegistry.getToolById(toolId),
    []
  );

  const getToolByRoute = useMemo(
    () => (route: string) => ToolRegistry.getToolByRoute(route),
    []
  );

  const getAccessibleToolsByCategory = useMemo(
    () => (category: string) => {
      const tools = ToolRegistry.getToolsByCategory(category as any);
      return tools.filter(tool => ToolRegistry.isToolAccessible(tool, userPlan));
    },
    [userPlan]
  );

  const getUserPlanLevel = useMemo(() => () => userPlan, [userPlan]);

  return {
    getAccessibleTools,
    isToolAccessible,
    getTool,
    getToolByRoute,
    getAccessibleToolsByCategory,
    getUserPlanLevel,
  };
}
