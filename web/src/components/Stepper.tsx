interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

export function Stepper({ value, onChange, min = -Infinity, max = Infinity, step = 1, disabled }: StepperProps) {
  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper-btn"
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, +(value - step).toFixed(10)))}
      >−</button>
      <span className="stepper-divider" />
      <button
        type="button"
        className="stepper-btn"
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, +(value + step).toFixed(10)))}
      >+</button>
    </div>
  );
}
