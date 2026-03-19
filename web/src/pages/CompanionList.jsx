import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import api from '../lib/api';
import CompanionCard from '../components/CompanionCard';
import PlanModal from '../components/PlanModal';
import { isCapacitor } from '../lib/platform';
import { getAppPageHeight } from '../lib/layout';

export default function CompanionList() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const nativePlatform = isCapacitor();
  const pageHeight = getAppPageHeight(nativePlatform);
  const [searchParams] = useSearchParams();
  const [companions, setCompanions] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [supportUnread, setSupportUnread] = useState(0);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const unreadPollRef = useRef(null);

  useEffect(() => {
    Promise.all([
      api.get('/api/companions').then(({ data }) => setCompanions(data.companions || [])),
      api.get('/api/billing/status').then(({ data }) => {
        setSubscription(data);
        const isNewUser = new URLSearchParams(window.location.search).get('newUser') === 'true';
        const skipped = localStorage.getItem('lovetta-plan-skipped');
        if (!data?.hasSubscription && (isNewUser || !skipped)) {
          setShowPlanModal(true);
          if (isNewUser) window.history.replaceState({}, '', window.location.pathname);
        }
      }),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const fetchUnread = () => {
      api.get('/api/support/unread').then(({ data }) => setSupportUnread(data.count || 0)).catch(() => {});
    };
    fetchUnread();
    unreadPollRef.current = setInterval(fetchUnread, 60000);
    return () => clearInterval(unreadPollRef.current);
  }, []);

  useEffect(() => {
    const checkout = searchParams.get('checkout');
    const tip = searchParams.get('tip');
    if (checkout === 'success') {
      toast('Subscription activated!', { type: 'success' });
      // Mark as subscribed locally (webhook may not have fired yet on dev)
      setSubscription(prev => prev ? { ...prev, hasSubscription: true, plan: prev.plan || 'monthly' } : { hasSubscription: true, plan: 'monthly' });
      // Also try to re-fetch in case webhook did fire
      api.get('/api/billing/status').then(({ data }) => setSubscription(data)).catch(() => {});
    }
    if (checkout === 'cancel') toast('Checkout canceled', { type: 'info' });
    // Tip success/cancel handled in ChatPage via server-inserted thank-you message
  }, [searchParams]);

  return (
    <div
      className="bg-brand-bg flex flex-col w-full overflow-hidden"
      style={{ height: pageHeight, overscrollBehaviorY: 'none' }}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-brand-bg/95 backdrop-blur-sm border-b border-brand-border app-page-gutter py-3 flex-shrink-0">
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-1">
            <img src="/assets/brand/logo_l.png" alt="Lovetta" className="h-8 w-8 rounded-lg" />
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
            className="relative p-2 rounded-lg border border-brand-border text-brand-muted hover:text-brand-text hover:bg-brand-card transition-colors"
            title="Profile"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M20 21a8 8 0 0 0-16 0" />
            </svg>
            {supportUnread > 0 && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-brand-accent rounded-full border-2 border-brand-bg" />
            )}
          </button>
        </div>
      </div>

      <div
        data-testid="companion-list-content"
        className="app-scroll-region flex-1 min-h-0 overflow-y-auto app-page-gutter py-4"
        style={{ overscrollBehaviorY: 'none' }}
      >
        {/* Subscription banner */}
        {!loading && subscription && !subscription.hasSubscription && (
          <div className="mb-4 bg-brand-card border border-brand-border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-brand-text">Start your free trial</p>
                <p className="text-xs text-brand-text-secondary mt-0.5">3 days free · Monthly or Yearly</p>
              </div>
              <button
                onClick={() => setShowPlanModal(true)}
                className="px-4 py-2 rounded-lg bg-brand-accent text-white text-sm font-semibold hover:bg-brand-accent-hover transition-colors"
              >
                View Plans
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

      <PlanModal
        isOpen={showPlanModal}
        onClose={() => { localStorage.setItem('lovetta-plan-skipped', '1'); setShowPlanModal(false); }}
        onSuccess={() => { setShowPlanModal(false); api.get('/api/billing/status').then(({ data }) => setSubscription(data)).catch(() => {}); }}
      />
    </div>
  );
}
