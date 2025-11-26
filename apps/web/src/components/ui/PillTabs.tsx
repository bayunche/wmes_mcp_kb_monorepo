import clsx from "clsx";

interface PillTabsProps<T extends string> {
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  value: T;
  onChange: (value: T) => void;
}

export function PillTabs<T extends string>({ options, value, onChange }: PillTabsProps<T>) {
  return (
    <div className="pill-tabs">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={clsx("pill-tabs__item", value === option.value && "is-active")}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
