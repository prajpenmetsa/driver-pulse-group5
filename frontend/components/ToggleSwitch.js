"use client";

export default function ToggleSwitch({
  id,
  label,
  checked,
  onChange,
  description,
}) {
  return (
    <div className="ui-toggle">
      <div className="ui-toggle-text">
        <label className="ui-toggle-label" htmlFor={id}>
          {label}
        </label>
        {description && <div className="ui-toggle-desc">{description}</div>}
      </div>

      <div className="ui-toggle-control">
        <input
          id={id}
          className="ui-toggle-input"
          type="checkbox"
          checked={!!checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="ui-toggle-track" aria-hidden="true">
          <span className="ui-toggle-thumb" />
        </span>
      </div>
    </div>
  );
}

