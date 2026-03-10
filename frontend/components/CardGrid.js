"use client";

export default function CardGrid({ children, cols = 3, className = "" }) {
  return (
    <div
      className={`ui-card-grid ui-card-grid-cols-${cols} ${className}`}
      role="list"
    >
      {children}
    </div>
  );
}

