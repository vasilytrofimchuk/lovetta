import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../Toast';
import { formatActions } from './MessageBubble';
import { TIP_AMOUNTS, getTipAmountsWithPrices, startTipCheckout } from '../../lib/tipCheckout';
import { isAppStore } from '../../lib/platform';
import { getErrorMessage } from '../../lib/api';

export default function TipPromoMessage({ message, companionId, onDismiss, onTipSuccess }) {
  const { user } = useAuth();
  const toast = useToast();
  const [tipLoading, setTipLoading] = useState(null);
  const [tipAmounts, setTipAmounts] = useState(TIP_AMOUNTS);

  useEffect(() => {
    if (isAppStore()) {
      getTipAmountsWithPrices().then(setTipAmounts).catch(() => {})
    }
  }, []);

  const handleTip = async (amount) => {
    setTipLoading(amount);
    try {
      const result = await startTipCheckout(amount, companionId, user?.id);
      if (result?.status === 'completed') {
        onDismiss?.();
        onTipSuccess?.(result);
      }
    } catch (err) {
      toast(getErrorMessage(err));
    } finally {
      setTipLoading(null);
    }
  };

  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[80%]">
        {/* Context text */}
        {message.context_text && (
          <div className="text-xs italic text-brand-muted mb-1 px-1">
            *{message.context_text}*
          </div>
        )}

        {/* Message bubble */}
        <div className="px-4 py-2.5 rounded-2xl rounded-bl-md whitespace-pre-wrap break-words text-[15px] leading-relaxed bg-brand-card border border-brand-border text-brand-text">
          {formatActions(message.content)}
        </div>

        {/* Tip buttons */}
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {tipAmounts.map(({ amount, priceString }) => (
            <button
              key={amount}
              onClick={() => handleTip(amount)}
              disabled={tipLoading !== null}
              className="py-2 px-1 rounded-lg border border-brand-accent/30 bg-brand-card text-brand-text hover:bg-brand-accent/15 hover:border-brand-accent/50 transition-colors disabled:opacity-50 font-medium"
            >
              <span className="block text-sm">{tipLoading === amount ? '...' : (priceString || `$${amount}`)}</span>
            </button>
          ))}
        </div>

        {/* Dismiss */}
        <button
          onClick={onDismiss}
          className="mt-1.5 text-xs text-brand-muted hover:text-brand-text-secondary transition-colors"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
