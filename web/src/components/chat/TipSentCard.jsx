export default function TipSentCard({ amount, companionName }) {
  return (
    <div className="flex justify-center mb-3">
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-brand-accent/10 border border-brand-accent/20">
        <span className="text-brand-accent text-sm">♥</span>
        <span className="text-sm text-brand-text-secondary">
          You sent {companionName || 'her'} a <span className="font-semibold text-brand-text">${amount}</span> tip
        </span>
      </div>
    </div>
  );
}
