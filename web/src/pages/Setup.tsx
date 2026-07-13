import { WelcomeStep } from '../components/setup/WelcomeStep';
import { ProviderStep } from '../components/setup/ProviderStep';
import { TelegramStep } from '../components/setup/TelegramStep';
import { ConfigStep } from '../components/setup/ConfigStep';
import { WalletStep } from '../components/setup/WalletStep';
import { ConnectStep } from '../components/setup/ConnectStep';
import { SetupComplete } from '../components/setup/SetupComplete';
import { useState } from 'react';
import { getSteps, useSetup } from '../components/setup/SetupContext';
import { setup } from '../lib/api';

// Re-export types for step components that import from here
export type { StepProps } from '../components/setup/SetupContext';

const ALL_STEP_COMPONENTS: Record<string, typeof WelcomeStep> = {
  welcome: WelcomeStep,
  provider: ProviderStep,
  config: ConfigStep,
  wallet: WalletStep,
  telegram: TelegramStep,
  connect: ConnectStep,
};

export function Setup() {
  const { step, data, loading, error, saved, canAdvance, setData, next, prev, handleSave } =
    useSetup();
  const [initDone, setInitDone] = useState(false);

  const steps = getSteps(data.telegramMode);

  if (saved) {
    return <SetupComplete />;
  }

  const stepMeta = steps[step];
  const StepComponent = stepMeta ? ALL_STEP_COMPONENTS[stepMeta.id] : undefined;
  const nextStepLabel = step < steps.length - 1 ? steps[step + 1].label : '';

  return (
    <>
      {StepComponent && <StepComponent data={data} onChange={setData} />}

      {error && <div className="alert error">{error}</div>}

      <div className="setup-nav" style={{ alignItems: 'center' }}>
        {step > 0 && (
          <button className="btn-ghost" onClick={prev} type="button">
            Back
          </button>
        )}
        {step === 0 && (
          <label className="label-inline" style={{ cursor: 'pointer', margin: 0 }}>
            <input
              type="checkbox"
              checked={data.riskAccepted}
              onChange={(e) => {
                const accepted = e.target.checked;
                setData({ ...data, riskAccepted: accepted });
                if (accepted && !initDone) {
                  setup.initWorkspace(data.agentName || undefined).then(() => setInitDone(true)).catch(() => {});
                }
              }}
            />
            <span>I understand the risks and accept full responsibility</span>
          </label>
        )}
        <div style={{ flex: 1 }} />
        {step < steps.length - 1 && (
          <button onClick={next} disabled={!canAdvance || loading} type="button">
            {loading ? <><span className="spinner sm" /> Next</> : `Next: ${nextStepLabel}`}
          </button>
        )}
        {step === steps.length - 1 && data.telegramMode === 'bot' && (
          <button onClick={handleSave} disabled={!canAdvance || loading} type="button">
            {loading ? <><span className="spinner sm" /> Saving...</> : 'Finish Setup'}
          </button>
        )}
      </div>
    </>
  );
}
