import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState(null);
  const [subLoading, setSubLoading] = useState(true);
  const [notifyMessages, setNotifyMessages] = useState(false);
  const [prefLoading, setPrefLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/billing/status')
      .then(({ data }) => setSubscription(data))
      .catch(() => {})
      .finally(() => setSubLoading(false));

    api.get('/api/user/preferences')
      .then(({ data }) => setNotifyMessages(data.notify_new_messages))
      .catch(() => {})
      .finally(() => setPrefLoading(false));
  }, []);

  const toggleNotify = async () => {
    const newVal = !notifyMessages;
    setNotifyMessages(newVal);
    setSaving(true);
    try {
      await api.put('/api/user/preferences', { notify_new_messages: newVal });
    } catch {
      setNotifyMessages(!newVal); // revert on error
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg p-4">
      <div className="max-w-md mx-auto pt-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-bold text-brand-text">Profile</h1>
          <button onClick={() => navigate('/')} className="text-sm text-brand-muted hover:text-brand-text transition-colors">
            Back
          </button>
        </div>

        {/* User info */}
        <div className="bg-brand-card border border-brand-border rounded-xl p-5 mb-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-xl font-bold flex-shrink-0">
              {(user?.display_name || user?.email || '?')[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              {user?.display_name && (
                <p className="font-semibold text-brand-text truncate">{user.display_name}</p>
              )}
              <p className="text-sm text-brand-text-secondary truncate">{user?.email}</p>
            </div>
          </div>
        </div>

        {/* Subscription */}
        <div className="bg-brand-card border border-brand-border rounded-xl p-5 mb-4">
          <h3 className="text-sm font-semibold text-brand-text mb-3">Subscription</h3>
          {subLoading ? (
            <p className="text-sm text-brand-muted">Loading...</p>
          ) : subscription?.hasSubscription ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-brand-success font-semibold">Active</span>
                <span className="text-brand-text-secondary capitalize">{subscription.plan} plan</span>
              </div>
              {subscription.status === 'canceling' && (
                <p className="text-xs text-brand-accent mb-1">Canceling at period end</p>
              )}
              {subscription.trialEndsAt && new Date(subscription.trialEndsAt) > new Date() && (
                <p className="text-sm text-brand-muted mb-1">
                  Trial ends: {new Date(subscription.trialEndsAt).toLocaleDateString()}
                </p>
              )}
              {subscription.currentPeriodEnd && (
                <p className="text-sm text-brand-muted mb-3">
                  {subscription.status === 'canceling' ? 'Ends' : 'Renews'}: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
              <button
                onClick={() => navigate('/pricing')}
                className="w-full py-2.5 rounded-lg border border-brand-border text-brand-text-secondary text-sm hover:bg-brand-surface transition-colors"
              >
                Manage Subscription
              </button>
            </>
          ) : (
            <div className="flex items-center justify-between">
              <div>
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
          )}
        </div>

        {/* Notifications */}
        <div className="bg-brand-card border border-brand-border rounded-xl p-5 mb-4">
          <h3 className="text-sm font-semibold text-brand-text mb-3">Notifications</h3>
          <div className="flex items-center justify-between">
            <div className="pr-4">
              <p className="text-sm text-brand-text">New message notifications</p>
              <p className="text-xs text-brand-muted mt-0.5">
                Get notified by email when she sends you a message
              </p>
            </div>
            <button
              onClick={toggleNotify}
              disabled={prefLoading || saving}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                notifyMessages ? 'bg-brand-accent' : 'bg-brand-surface border border-brand-border'
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  notifyMessages ? 'translate-x-5.5 left-0.5' : 'left-0.5'
                }`}
                style={{ transform: notifyMessages ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </button>
          </div>
        </div>

        {/* Sign out */}
        <button
          onClick={logout}
          className="w-full py-3 rounded-xl border border-brand-border text-brand-text-secondary hover:bg-brand-surface transition-colors text-sm mt-4"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
