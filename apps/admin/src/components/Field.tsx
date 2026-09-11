/** The one labeled-input primitive used by every create/edit form in the admin panel. */
export function Field({
  label,
  value,
  onChange,
  required,
  type = 'text',
  className,
  helperText,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  className?: string;
  helperText?: string;
}) {
  return (
    <label className={`block text-sm ${className ?? ''}`}>
      <span className="font-medium text-slate-700">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      {helperText ? <span className="mt-1 block text-xs text-slate-500">{helperText}</span> : null}
    </label>
  );
}
