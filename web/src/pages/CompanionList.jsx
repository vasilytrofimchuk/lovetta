import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import CompanionCard from '../components/CompanionCard';

export default function CompanionList() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [companions, setCompanions] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/api/companions').then(({ data }) => setCompanions(data.companions || [])),
      api.get('/api/billing/status').then(({ data }) => setSubscription(data)),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const checkout = searchParams.get('checkout');
    const tip = searchParams.get('tip');
    if (checkout === 'success') {
      setToast('Subscription activated!');
      // Mark as subscribed locally (webhook may not have fired yet on dev)
      setSubscription(prev => prev ? { ...prev, hasSubscription: true, plan: prev.plan || 'monthly' } : { hasSubscription: true, plan: 'monthly' });
      // Also try to re-fetch in case webhook did fire
      api.get('/api/billing/status').then(({ data }) => setSubscription(data)).catch(() => {});
    }
    if (checkout === 'cancel') setToast('Checkout canceled');
    if (tip === 'success') setToast('Thank you for the tip!');
    if (tip === 'cancel') setToast('Tip canceled');
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-brand-bg/95 backdrop-blur-sm border-b border-brand-border px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <img src="/assets/brand/logo_text.png" alt="Lovetta" className="h-7" />
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/pricing')}
              className="p-2 rounded-lg text-brand-muted hover:text-brand-text hover:bg-brand-card transition-colors"
              title="Pricing & Account"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            <button
              onClick={logout}
              className="text-sm text-brand-muted hover:text-brand-text transition-colors px-2 py-1"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-4">
        {/* Toast */}
        {toast && (
          <div className="mb-4 p-3 rounded-lg bg-brand-success/10 border border-brand-success/30 text-brand-success text-sm text-center">
            {toast}
            <button onClick={() => setToast(null)} className="ml-3 text-brand-success/60 hover:text-brand-success">×</button>
          </div>
        )}

        {/* Subscription banner */}
        {!loading && subscription && !subscription.hasSubscription && (
          <div className="mb-4 bg-brand-card border border-brand-border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-brand-text-secondary">Subscription</span>
                <p className="text-brand-muted font-medium">No active plan</p>
                <p className="text-xs text-brand-text-secondary mt-0.5">3-day free trial included</p>
              </div>
              <button
                onClick={() => navigate('/pricing')}
                className="px-4 py-2 rounded-lg bg-brand-accent text-white text-sm font-semibold hover:bg-brand-accent-hover transition-colors"
              >
                Try Free
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-16 text-brand-muted">Loading...</div>
        )}

        {/* Empty state */}
        {!loading && companions.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">💜</div>
            <h2 className="text-xl font-semibold text-brand-text mb-2">Bring someone special to life</h2>
            <p className="text-brand-text-secondary mb-6">
              Give life to a unique girlfriend — pick a soul that speaks to you, or create one from your imagination.
            </p>
            <button
              onClick={() => navigate('/create')}
              className="px-6 py-3 rounded-xl bg-brand-accent text-white font-semibold hover:bg-brand-accent-hover transition-colors"
            >
              Get Started
            </button>
          </div>
        )}

        {/* Companion list */}
        {!loading && companions.length > 0 && (
          <div className="space-y-2">
            {companions.map(c => (
              <CompanionCard key={c.id} companion={c} />
            ))}

            <button
              onClick={() => navigate('/create')}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-brand-accent/40 text-brand-accent hover:bg-brand-accent/10 transition-colors mt-4"
            >
              <span className="text-xl leading-none">+</span>
              <span className="text-sm font-medium">Awaken a new girlfriend</span>
            </button>
          </div>
        )}
      </div>

      {/* Floating create button */}
      {!loading && companions.length > 0 && (
        <button
          onClick={() => navigate('/create')}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-brand-accent text-white text-2xl font-bold shadow-lg hover:bg-brand-accent-hover transition-colors flex items-center justify-center"
          title="Create new girlfriend"
        >
          +
        </button>
      )}
    </div>
  );
}
