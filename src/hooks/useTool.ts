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
import { useAuth } from '@/lib/AuthContext';

export interface UseToolResult {
  // Get all tools accessible to the current user
  getAccessibleTools: () => ToolDefinition[];

  // Check if a specific tool is accessible to the current user
  isToolAccessible: (toolId: string) => boolean;

  // Get tool by ID
  getTool: (toolId: string) => ToolDefinition | undefined;

  // Get tools by category that are accessible
  getAccessibleToolsByCategory: (category: string) => ToolDefinition[];

  // Get current user's plan level
  getUserPlanLevel: () => PlanLevel;
}

export function useTool(): UseToolResult {
  const { user, plan } = useAuth();

  const userPlan = useMemo<PlanLevel>(() => {
    // Map the effective plan from AuthContext to a PlanLevel
    // Default to 'free' if plan is undefined
    if (!plan?.effectiveId) return 'free';

    const planMap: Record<string, PlanLevel> = {
      free: 'free',
      basic: 'basic',
      pro: 'pro',
      elite: 'elite',
      ultimate: 'ultimate',
      friends: 'friends',
      friends_monthly: 'elite',
      trial_10_10: 'ultimate',
    };

    return planMap[plan.effectiveId] || 'free';
  }, [plan?.effectiveId]);

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
    getAccessibleToolsByCategory,
    getUserPlanLevel,
  };
}
