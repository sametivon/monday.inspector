interface Props {
  currentStep: 1 | 2 | 3 | 4;
  steps: string[];
}

/** Sticky stepper at the top of the Importer canvas. */
export function Stepper({ currentStep, steps }: Props) {
  return (
    <div className="imp-stepper">
      {steps.map((label, idx) => {
        const stepNum = (idx + 1) as 1 | 2 | 3 | 4;
        const state =
          stepNum < currentStep
            ? "done"
            : stepNum === currentStep
              ? "active"
              : "pending";
        return (
          <div
            key={label}
            className={`imp-step ${state === "done" ? "done" : state === "active" ? "active" : ""}`}
          >
            <span className="imp-step-num">
              {state === "done" ? "✓" : stepNum}
            </span>
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
