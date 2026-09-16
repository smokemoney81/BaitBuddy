/**
 * Generate navigation items and groups from the Tool Registry
 * This enables a gradual migration from hardcoded navigation to registry-driven navigation
 *
 * Usage (for backward compatibility):
 *   import { navigationItems, navigationGroups } from './navigationItemsFromRegistry';
 *
 * For new code:
 *   Use ToolRegistry directly
 */

import { ToolRegistry, type ToolCategory } from '@/lib/toolRegistry';

// Dynamically generate navigationItems object for backward compatibility
// Maps tool IDs to display info
function generateNavigationItems() {
  const items: Record<string, { name: string; icon: string }> = {};

  ToolRegistry.getAllTools().forEach(tool => {
    // Extract icon component name from icon property
    items[tool.id] = {
      name: tool.name,
      icon: tool.icon,
    };
  });

  return items;
}

// Dynamically generate navigationGroups array for backward compatibility
function generateNavigationGroups() {
  const categoryToGroupName: Record<ToolCategory, string> = {
    ai: 'KI-Tools',
    map: 'Karte & Spots',
    weather: 'Wetter & Prognosen',
    logbook: 'Fangbuch',
    planning: 'Planung',
    gear: 'Ausrüstung',
    community: 'Community',
    knowledge: 'Wissen & Angelschein',
    settings: 'Einstellungen',
    legal: 'Rechtliches & Support',
  };

  const grouped = ToolRegistry.listByCategory();
  const groups = [];

  // Order categories consistently
  const categoryOrder: ToolCategory[] = [
    'ai',
    'map',
    'weather',
    'logbook',
    'planning',
    'gear',
    'community',
    'knowledge',
    'settings',
    'legal',
  ];

  categoryOrder.forEach(category => {
    if (grouped.has(category)) {
      const tools = grouped.get(category)!;
      groups.push({
        name: categoryToGroupName[category],
        items: tools.map(tool => [tool.name, tool.id]),
      });
    }
  });

  return groups;
}

// Export as singletons for backward compatibility
export const navigationItems = generateNavigationItems();
export const navigationGroups = generateNavigationGroups();

// Export generator functions for dynamic updates
export { generateNavigationItems, generateNavigationGroups };
