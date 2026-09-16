import { describe, it, expect } from 'vitest';
import { ToolRegistry, TOOLS, type ToolDefinition, type PlanLevel } from './toolRegistry';

describe('ToolRegistry', () => {
  describe('Basic Lookups', () => {
    it('should find tool by ID', () => {
      const tool = ToolRegistry.getToolById('ki-buddy');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('KI-Buddy');
    });

    it('should return undefined for non-existent tool ID', () => {
      const tool = ToolRegistry.getToolById('does-not-exist');
      expect(tool).toBeUndefined();
    });

    it('should find tool by route', () => {
      const tool = ToolRegistry.getToolByRoute('/KiBuddyBeta');
      expect(tool).toBeDefined();
      expect(tool?.id).toBe('ki-buddy');
    });

    it('should return undefined for non-existent route', () => {
      const tool = ToolRegistry.getToolByRoute('/NonExistent');
      expect(tool).toBeUndefined();
    });

    it('should list all tools', () => {
      const tools = ToolRegistry.getAllTools();
      expect(tools.length).toBe(TOOLS.length);
      expect(tools.length).toBeGreaterThan(35);
    });

    it('should return correct tool count', () => {
      expect(ToolRegistry.getToolCount()).toBe(TOOLS.length);
    });
  });

  describe('Category Filtering', () => {
    it('should get tools by category', () => {
      const aiTools = ToolRegistry.getToolsByCategory('ai');
      expect(aiTools.length).toBeGreaterThan(5);
      expect(aiTools.every(t => t.category === 'ai')).toBe(true);
    });

    it('should list tools grouped by category', () => {
      const grouped = ToolRegistry.listByCategory();
      expect(grouped.size).toBeGreaterThan(5);
      expect(grouped.has('ai')).toBe(true);
      expect(grouped.has('map')).toBe(true);
      expect(grouped.has('settings')).toBe(true);
    });

    it('should have tools in all known categories', () => {
      const categories = ['ai', 'map', 'weather', 'logbook', 'planning', 'gear', 'community', 'knowledge', 'settings', 'legal'];
      categories.forEach(cat => {
        const tools = ToolRegistry.getToolsByCategory(cat as any);
        expect(tools.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Plan-Based Access Control', () => {
    it('free user should access free tools', () => {
      const tools = ToolRegistry.getToolsByPlanLevel('free');
      expect(tools.length).toBeGreaterThan(20);
      expect(tools.some(t => t.requires === 'free')).toBe(true);
    });

    it('basic user should access free and basic tools', () => {
      const tools = ToolRegistry.getToolsByPlanLevel('basic');
      expect(tools.length).toBeGreaterThan(tools.filter(t => t.requires === 'free').length);
      expect(tools.every(t => ['free', 'basic'].includes(t.requires))).toBe(true);
    });

    it('pro user should access free, basic, and pro tools', () => {
      const tools = ToolRegistry.getToolsByPlanLevel('pro');
      expect(tools.every(t => ['free', 'basic', 'pro'].includes(t.requires))).toBe(true);
    });

    it('elite user should access free, basic, pro, and elite tools', () => {
      const tools = ToolRegistry.getToolsByPlanLevel('elite');
      expect(tools.every(t => ['free', 'basic', 'pro', 'elite'].includes(t.requires))).toBe(true);
    });

    it('ultimate user should access all tools except friends', () => {
      const tools = ToolRegistry.getToolsByPlanLevel('ultimate');
      expect(tools.every(t => ['free', 'basic', 'pro', 'elite', 'ultimate'].includes(t.requires))).toBe(true);
    });

    it('friends user should access all tools', () => {
      const tools = ToolRegistry.getToolsByPlanLevel('friends');
      expect(tools.length).toBe(TOOLS.length);
    });

    it('should correctly check tool accessibility by plan', () => {
      const kibuddy = ToolRegistry.getToolById('ki-buddy');
      expect(kibuddy).toBeDefined();

      expect(ToolRegistry.isToolAccessible(kibuddy!, 'free')).toBe(true);
      expect(ToolRegistry.isToolAccessible(kibuddy!, 'basic')).toBe(true);
    });

    it('should deny access to pro tools for free users', () => {
      const catchAnalysis = ToolRegistry.getToolById('catch-analysis');
      expect(catchAnalysis).toBeDefined();
      expect(catchAnalysis?.requires).toBe('pro');

      expect(ToolRegistry.isToolAccessible(catchAnalysis!, 'free')).toBe(false);
      expect(ToolRegistry.isToolAccessible(catchAnalysis!, 'basic')).toBe(false);
      expect(ToolRegistry.isToolAccessible(catchAnalysis!, 'pro')).toBe(true);
    });

    it('should deny access to elite tools for basic users', () => {
      const arWater = ToolRegistry.getToolById('ar-water');
      expect(arWater).toBeDefined();
      expect(arWater?.requires).toBe('elite');

      expect(ToolRegistry.isToolAccessible(arWater!, 'free')).toBe(false);
      expect(ToolRegistry.isToolAccessible(arWater!, 'basic')).toBe(false);
      expect(ToolRegistry.isToolAccessible(arWater!, 'pro')).toBe(false);
      expect(ToolRegistry.isToolAccessible(arWater!, 'elite')).toBe(true);
    });
  });

  describe('Offline Support', () => {
    it('should get tools with full offline support', () => {
      const tools = ToolRegistry.getToolsByOfflineSupport('FULL');
      expect(tools.length).toBeGreaterThan(10);
      expect(tools.every(t => t.offline === 'FULL')).toBe(true);
    });

    it('should get tools with partial or full offline support', () => {
      const tools = ToolRegistry.getToolsByOfflineSupport('PARTIAL');
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.every(t => ['FULL', 'PARTIAL'].includes(t.offline))).toBe(true);
    });

    it('should include all tools for NONE support query', () => {
      const tools = ToolRegistry.getToolsByOfflineSupport('NONE');
      expect(tools.length).toBe(TOOLS.length);
    });

    it('should have specific offline-first tools', () => {
      const catches = ToolRegistry.getToolById('catches');
      const trips = ToolRegistry.getToolById('trips');
      const gear = ToolRegistry.getToolById('gear');

      expect(catches?.offline).toBe('FULL');
      expect(trips?.offline).toBe('FULL');
      expect(gear?.offline).toBe('FULL');
    });
  });

  describe('Search & Discovery', () => {
    it('should search tools by name', () => {
      const results = ToolRegistry.searchByName('buddy');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(t => t.id === 'ki-buddy')).toBe(true);
    });

    it('should search tools by description', () => {
      const results = ToolRegistry.searchByName('spot');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should search tools by tag', () => {
      const results = ToolRegistry.searchByTag('ai');
      expect(results.length).toBeGreaterThan(3);
      expect(results.every(t => t.tags?.includes('ai'))).toBe(true);
    });

    it('should be case-insensitive for search', () => {
      const lower = ToolRegistry.searchByName('buddy');
      const upper = ToolRegistry.searchByName('BUDDY');
      expect(lower.length).toBe(upper.length);
    });

    it('should find tools by various tags', () => {
      const voiceTags = ToolRegistry.searchByTag('voice');
      expect(voiceTags.length).toBeGreaterThan(0);

      const gpsTags = ToolRegistry.searchByTag('gps');
      expect(gpsTags.length).toBeGreaterThan(0);
    });
  });

  describe('Beta Tools', () => {
    it('should list beta tools', () => {
      const betaTools = ToolRegistry.listBetaTools();
      expect(betaTools.length).toBeGreaterThan(0);
      expect(betaTools.every(t => t.beta === true)).toBe(true);
    });

    it('should include specific beta tools', () => {
      const betaTools = ToolRegistry.listBetaTools();
      const betaIds = betaTools.map(t => t.id);

      expect(betaIds).toContain('voice-buddy');
      expect(betaIds).toContain('fish-identification');
    });
  });

  describe('Data Integrity', () => {
    it('should have unique tool IDs', () => {
      const ids = TOOLS.map(t => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have unique routes', () => {
      const routes = TOOLS.map(t => t.route);
      const uniqueRoutes = new Set(routes);
      expect(uniqueRoutes.size).toBe(routes.length);
    });

    it('should have valid icon names', () => {
      TOOLS.forEach(tool => {
        expect(tool.icon).toBeTruthy();
        expect(typeof tool.icon).toBe('string');
      });
    });

    it('should have valid category assignments', () => {
      const validCategories = ['ai', 'map', 'weather', 'logbook', 'planning', 'gear', 'community', 'knowledge', 'settings', 'legal'];
      TOOLS.forEach(tool => {
        expect(validCategories).toContain(tool.category);
      });
    });

    it('should have valid plan requirements', () => {
      const validPlans = ['free', 'basic', 'pro', 'elite', 'ultimate', 'friends'];
      TOOLS.forEach(tool => {
        expect(validPlans).toContain(tool.requires);
      });
    });

    it('should have valid offline support values', () => {
      const validSupport = ['NONE', 'PARTIAL', 'FULL'];
      TOOLS.forEach(tool => {
        expect(validSupport).toContain(tool.offline);
      });
    });

    it('should validate all tools', () => {
      TOOLS.forEach(tool => {
        const validation = ToolRegistry.validateTool(tool);
        expect(validation.valid).toBe(true, `Tool ${tool.id} failed validation: ${validation.errors.join(', ')}`);
      });
    });
  });

  describe('Specific Tool Verification', () => {
    it('should have required core tools', () => {
      const coreToolIds = ['ki-buddy', 'map', 'weather', 'catches', 'trips', 'community', 'gear', 'profile'];
      coreToolIds.forEach(id => {
        const tool = ToolRegistry.getToolById(id);
        expect(tool).toBeDefined();
        expect(tool?.id).toBe(id);
      });
    });

    it('should have correct plan requirements for essential tools', () => {
      // Free tools
      ['ki-buddy', 'map', 'weather', 'catches', 'trips'].forEach(id => {
        const tool = ToolRegistry.getToolById(id);
        expect(tool?.requires).toBe('free');
      });

      // Basic tools
      ['voice-buddy', 'fish-identification', 'bait-mixer', 'devices'].forEach(id => {
        const tool = ToolRegistry.getToolById(id);
        expect(['basic', 'pro', 'elite', 'ultimate', 'friends']).toContain(tool?.requires);
      });
    });

    it('KI-Buddy should be free and partially offline', () => {
      const buddy = ToolRegistry.getToolById('ki-buddy');
      expect(buddy?.requires).toBe('free');
      expect(buddy?.offline).toBe('PARTIAL');
    });

    it('Catch logging should be free and fully offline', () => {
      const catches = ToolRegistry.getToolById('catches');
      expect(catches?.requires).toBe('free');
      expect(catches?.offline).toBe('FULL');
    });

    it('AR features should require elite plan', () => {
      const ar = ToolRegistry.getToolById('ar-water');
      expect(ar?.requires).toBe('elite');
      expect(ar?.offline).toBe('NONE');
    });
  });

  describe('Performance', () => {
    it('should return results quickly for common queries', () => {
      const start = performance.now();
      ToolRegistry.getToolsByCategory('ai');
      ToolRegistry.searchByName('buddy');
      ToolRegistry.getToolsByPlanLevel('pro');
      const duration = performance.now() - start;

      // Should complete in less than 10ms even on slow devices
      expect(duration).toBeLessThan(10);
    });
  });
});
