"use client";

export default function Card({
  title,
  subtitle,
  children,
  variant = "default",
  ariaLabel,
  className = "",
}) {
  const label = ariaLabel || title || "Card";
  return (
    <section
      className={`ui-card ui-card-${variant} ${className}`}
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      {(title || subtitle) && (
        <div className="ui-card-header">
          <div className="ui-card-title-wrap">
            {title && <div className="ui-card-title">{title}</div>}
            {subtitle && <div className="ui-card-subtitle">{subtitle}</div>}
          </div>
        </div>
      )}
      <div className="ui-card-body">{children}</div>
    </section>
  );
}

