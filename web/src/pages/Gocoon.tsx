import { GocoonPanel } from '../components/GocoonPanel';

export function Gocoon() {
  return (
    <div>
      <div className="header">
        <h1>Gocoon</h1>
        <p>Decentralized LLM on TON. Install, fund, top up, and withdraw.</p>
      </div>
      <GocoonPanel />
    </div>
  );
}
