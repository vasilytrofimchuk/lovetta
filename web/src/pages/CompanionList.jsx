import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import CompanionCard from '../components/CompanionCard';

export default function CompanionList() {
  const { user } = useAuth();
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
    // Tip success/cancel handled in ChatPage via server-inserted thank-you message
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-brand-bg/95 backdrop-blur-sm border-b border-brand-border px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-1">
            <img src="/assets/brand/logo_text.png" alt="Lovetta" className="h-7" />
            <button
              onClick={() => navigate('/create')}
              className="p-2 rounded-lg border border-brand-border text-brand-muted hover:text-brand-text hover:bg-brand-card transition-colors"
              title="Create new girlfriend"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
          <button
            onClick={() => navigate('/profile')}
            className="p-2 rounded-lg border border-brand-border text-brand-muted hover:text-brand-text hover:bg-brand-card transition-colors"
            title="Profile"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M20 21a8 8 0 0 0-16 0" />
            </svg>
          </button>
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
          <div className="space-y-3">
            {companions.map(c => (
              <CompanionCard key={c.id} companion={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
