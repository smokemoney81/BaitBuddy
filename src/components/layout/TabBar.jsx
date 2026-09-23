import React, { useRef, useEffect } from 'react';

export default function TabBar({ tabs, activeTab, onTabChange, className = '' }) {
  const activeRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const el = activeRef.current;
      const left = el.offsetLeft - container.offsetWidth / 2 + el.offsetWidth / 2;
      if (typeof container.scrollTo === 'function') {
        container.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
      }
    }
  }, [activeTab]);

  return (
    <div
      ref={scrollRef}
      className={`bb-tab-bar ${className}`}
      role="tablist"
    >
      {tabs.map(tab => {
        const key = typeof tab === 'string' ? tab : tab.key;
        const label = typeof tab === 'string' ? tab : tab.label;
        const isActive = key === activeTab;
        return (
          <button
            key={key}
            ref={isActive ? activeRef : null}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`bb-tab-pill ${isActive ? 'bb-tab-active' : ''}`}
            onClick={() => onTabChange(key)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
