import { getSteps, useSetup } from './SetupContext';
import { StepIndicator } from './StepIndicator';

export function SetupNav() {
  const { step, data } = useSetup();
  const steps = getSteps(data.telegramMode);

  return <StepIndicator steps={steps} current={step} />;
}
