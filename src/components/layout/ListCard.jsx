import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export default function ListCard({
  to,
  icon: Icon,
  iconColor = 'text-cyan-300',
  iconBg = 'rgba(0,229,255,.10)',
  title,
  subtitle,
  trailing,
  onClick,
  className = '',
}) {
  const content = (
    <>
      {Icon && (
        <div className="bb-list-icon" style={{ background: iconBg }}>
          <Icon size={20} className={iconColor} />
        </div>
      )}
      <div className="bb-list-text">
        <span className="bb-list-title">{title}</span>
        {subtitle && <span className="bb-list-subtitle">{subtitle}</span>}
      </div>
      {trailing || <ChevronRight size={18} className="text-slate-500 shrink-0" />}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={`bb-list-card ${className}`} onClick={onClick}>
        {content}
      </Link>
    );
  }

  return (
    <div className={`bb-list-card ${className}`} onClick={onClick} role={onClick ? 'button' : undefined}>
      {content}
    </div>
  );
}
