"use client";

export default function Button({
  variant = "primary",
  size = "md",
  icon,
  onClick,
  ariaLabel,
  disabled = false,
  type = "button",
  children,
  className = "",
}) {
  return (
    <button
      type={type}
      className={`ui-btn ui-btn-${variant} ui-btn-${size} ${className}`}
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={disabled}
    >
      {icon && <span className="ui-btn-icon" aria-hidden="true">{icon}</span>}
      <span className="ui-btn-text">{children}</span>
    </button>
  );
}

