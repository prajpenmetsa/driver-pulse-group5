"use client";

export default function IconButton({
  icon,
  onClick,
  ariaLabel,
  variant = "ghost",
  disabled = false,
  className = "",
  type = "button",
}) {
  return (
    <button
      type={type}
      className={`ui-icon-btn ui-icon-btn-${variant} ${className}`}
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={disabled}
    >
      <span className="ui-icon-btn-icon" aria-hidden="true">
        {icon}
      </span>
    </button>
  );
}

