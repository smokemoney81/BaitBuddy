import React from 'react';

export default function PageHero({
  image,
  eyebrow,
  title,
  subtitle,
  children,
  className = '',
  minHeight = 220,
}) {
  return (
    <section
      className={`bb-page-hero ${className}`}
      style={{ minHeight }}
    >
      {image && (
        <img
          src={image}
          alt=""
          className="bb-page-hero-bg"
          loading="eager"
        />
      )}
      <div className="bb-page-hero-content">
        {eyebrow && <p className="bb-eyebrow mb-1">{eyebrow}</p>}
        {title && <h1 className="bb-page-hero-title">{title}</h1>}
        {subtitle && <p className="bb-muted mt-1">{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}
