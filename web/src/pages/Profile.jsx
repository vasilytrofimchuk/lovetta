import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { isAppStore, isCapacitor } from '../lib/platform';

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState(null);
  const [subLoading, setSubLoading] = useState(true);
  const [notifyMessages, setNotifyMessages] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [proactiveMessages, setProactiveMessages] = useState(true);
  const [explicitContent, setExplicitContent] = useState(false);
  const [prefLoading, setPrefLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Referral state
  const [referral, setReferral] = useState(null);
  const [refLoading, setRefLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState('');
  const [payoutDetail, setPayoutDetail] = useState('');
  const [payoutSaving, setPayoutSaving] = useState(false);
  const [cashoutLoading, setCashoutLoading] = useState(false);
  const [refMsg, setRefMsg] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const PAYOUT_OPTIONS = [
    { value: 'paypal', label: 'PayPal' },
    { value: 'venmo', label: 'Venmo' },
    { value: 'zelle', label: 'Zelle' },
    { value: 'credit', label: 'Account Credit' },
  ];


  const [referralExpanded, setReferralExpanded] = useState(false);
  const appStore = isAppStore();

  // Navigate to support if there are unread messages
  useEffect(() => {
    api.get('/api/support/unread')
      .then(({ data }) => { if (data.count > 0) navigate('/support'); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.get('/api/billing/status')
      .then(({ data }) => setSubscription(data))
      .catch(() => {})
      .finally(() => setSubLoading(false));

    api.get('/api/user/preferences')
      .then(({ data }) => {
        setNotifyMessages(data.notify_new_messages);
        setExplicitContent(data.explicit_content);
        setProactiveMessages(data.proactive_messages ?? true);
      })
      .catch(() => {})
      .finally(() => setPrefLoading(false));

    // Check existing push subscription
    if (isCapacitor()) {
      // For native, check APNs registration status
      import('@capacitor/push-notifications').then(({ PushNotifications }) => {
        PushNotifications.checkPermissions().then(status => {
          setPushEnabled(status.receive === 'granted');
        });
      }).catch(() => {});
    } else if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => {
          setPushEnabled(!!sub);
        });
      }).catch(() => {});
    }

    // Load referral stats only for non-App Store users
    if (!appStore) {
      api.get('/api/referral/stats')
        .then(({ data }) => {
          setReferral(data);
          if (data.payoutMethod) setPayoutMethod(data.payoutMethod);
          if (data.payoutDetail) setPayoutDetail(data.payoutDetail);
        })
        .catch(() => {})
        .finally(() => setRefLoading(false));
    } else {
      setRefLoading(false);
    }
  }, []);

  const toggleNotify = async () => {
    const newVal = !notifyMessages;
    setNotifyMessages(newVal);
    setSaving(true);
    try {
      await api.put('/api/user/preferences', { notify_new_messages: newVal });
    } catch {
      setNotifyMessages(!newVal);
    } finally {
      setSaving(false);
    }
  };

  const togglePush = async () => {
    setSaving(true);
    try {
      if (isCapacitor()) {
        // Native push via Capacitor
        if (pushEnabled) {
          const { unregisterNativePush } = await import('../lib/push-native');
          await unregisterNativePush();
          setPushEnabled(false);
        } else {
          const { registerNativePush } = await import('../lib/push-native');
          await registerNativePush();
          setPushEnabled(true);
        }
      } else {
        // Web push via VAPID
        if (pushEnabled) {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            await sub.unsubscribe();
            await api.delete('/api/user/push/unsubscribe', { data: { endpoint: sub.endpoint } });
          }
          setPushEnabled(false);
        } else {
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') {
            setSaving(false);
            return;
          }
          const { data: vapid } = await api.get('/api/user/vapid-key');
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: vapid.publicKey,
          });
          const subJson = sub.toJSON();
          await api.post('/api/user/push/subscribe', {
            endpoint: subJson.endpoint,
            keys: subJson.keys,
          });
          setPushEnabled(true);
        }
      }
    } catch (err) {
      console.error('Push toggle error:', err);
    } finally {
      setSaving(false);
    }
  };

  const toggleProactive = async () => {
    const newVal = !proactiveMessages;
    setProactiveMessages(newVal);
    setSaving(true);
    try {
      await api.put('/api/user/preferences', { proactive_messages: newVal });
    } catch {
      setProactiveMessages(!newVal);
    } finally {
      setSaving(false);
    }
  };

  const toggleExplicit = async () => {
    const newVal = !explicitContent;
    setExplicitContent(newVal);
    setSaving(true);
    try {
      await api.put('/api/user/preferences', { explicit_content: newVal });
    } catch {
      setExplicitContent(!newVal);
    } finally {
      setSaving(false);
    }
  };

  const showPushToggle = isCapacitor() || ('PushManager' in window);

  return (
    <div className="min-h-screen bg-brand-bg px-4 pb-8"
      style={{ paddingTop: isCapacitor() ? 'max(2rem, env(safe-area-inset-top, 2rem))' : '2rem' }}>
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/')} className="text-brand-muted hover:text-brand-text transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-brand-text">Profile</h1>
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
                onClick={() => {
                  if (appStore) {
                    window.location.href = 'https://apps.apple.com/account/subscriptions';
                  } else {
                    navigate('/pricing');
                  }
                }}
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
          <div className="space-y-4">
            {/* Email notifications */}
            <div className="flex items-center justify-between">
              <div className="pr-4">
                <p className="text-sm text-brand-text">Email notifications</p>
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

            {/* Push notifications */}
            {showPushToggle && (
              <div className="flex items-center justify-between">
                <div className="pr-4">
                  <p className="text-sm text-brand-text">Push notifications</p>
                  <p className="text-xs text-brand-muted mt-0.5">
                    {isCapacitor() ? 'Notifications when she messages you' : 'Browser notifications when she messages you'}
                  </p>
                </div>
                <button
                  onClick={togglePush}
                  disabled={prefLoading || saving}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                    pushEnabled ? 'bg-brand-accent' : 'bg-brand-surface border border-brand-border'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      pushEnabled ? 'translate-x-5.5 left-0.5' : 'left-0.5'
                    }`}
                    style={{ transform: pushEnabled ? 'translateX(20px)' : 'translateX(0)' }}
                  />
                </button>
              </div>
            )}

            {/* Proactive messages */}
            <div className="flex items-center justify-between">
              <div className="pr-4">
                <p className="text-sm text-brand-text">Proactive messages</p>
                <p className="text-xs text-brand-muted mt-0.5">
                  Let her reach out when she's thinking of you
                </p>
              </div>
              <button
                onClick={toggleProactive}
                disabled={prefLoading || saving}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                  proactiveMessages ? 'bg-brand-accent' : 'bg-brand-surface border border-brand-border'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    proactiveMessages ? 'translate-x-5.5 left-0.5' : 'left-0.5'
                  }`}
                  style={{ transform: proactiveMessages ? 'translateX(20px)' : 'translateX(0)' }}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Content Preferences — hidden on App Store (server enforces level 0) */}
        {!appStore && (
          <div className="bg-brand-card border border-brand-border rounded-xl p-5 mb-4">
            <h3 className="text-sm font-semibold text-brand-text mb-3">Content Preferences</h3>
            <div className="flex items-center justify-between">
              <div className="pr-4">
                <p className="text-sm text-brand-text">Explicit content</p>
                <p className="text-xs text-brand-muted mt-0.5">
                  Allow mature content in conversations and images
                </p>
              </div>
              <button
                onClick={toggleExplicit}
                disabled={prefLoading || saving}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                  explicitContent ? 'bg-brand-accent' : 'bg-brand-surface border border-brand-border'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    explicitContent ? 'translate-x-5.5 left-0.5' : 'left-0.5'
                  }`}
                  style={{ transform: explicitContent ? 'translateX(20px)' : 'translateX(0)' }}
                />
              </button>
            </div>
          </div>
        )}

        {/* Referral Program — hidden on App Store (Apple doesn't allow external payment incentives) */}
        {!appStore && (
          <div className="bg-brand-card border border-brand-border rounded-xl p-5 mb-4">
            <button
              onClick={() => setReferralExpanded(e => !e)}
              className="w-full flex items-center justify-between"
            >
              <h3 className="text-sm font-semibold text-brand-text">Referral Program</h3>
              <svg
                className={`w-4 h-4 text-brand-muted transition-transform ${referralExpanded ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {referralExpanded && (refLoading ? (
              <p className="text-sm text-brand-muted mt-3">Loading...</p>
            ) : referral ? (
              <div className="space-y-4">
                {/* Referral link */}
                <div>
                  <p className="text-xs text-brand-muted mb-1.5">Your referral link</p>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={referral.referralLink}
                      className="flex-1 px-3 py-2 bg-brand-surface border border-brand-border rounded-lg text-brand-text text-sm font-mono truncate"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(referral.referralLink);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="px-3 py-2 rounded-lg bg-brand-accent text-white text-sm font-semibold hover:bg-brand-accent-hover transition-colors flex-shrink-0"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex gap-4">
                  <div className="flex-1 bg-brand-surface rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-brand-text">{referral.invitedCount}</p>
                    <p className="text-xs text-brand-muted">Invited</p>
                  </div>
                  <div className="flex-1 bg-brand-surface rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-brand-text">${(referral.balanceCents / 100).toFixed(2)}</p>
                    <p className="text-xs text-brand-muted">Earned</p>
                  </div>
                </div>

                {referral.pendingCashoutCents > 0 && (
                  <p className="text-xs text-brand-accent">
                    Pending cashout: ${(referral.pendingCashoutCents / 100).toFixed(2)}
                  </p>
                )}

                {/* Payout method */}
                <div>
                  <p className="text-xs text-brand-muted mb-1.5">Payout method</p>
                  <div className="relative mb-2">
                    <button
                      type="button"
                      onClick={() => setDropdownOpen(!dropdownOpen)}
                      className="w-full flex items-center justify-between px-3 py-2.5 bg-brand-surface border border-brand-border rounded-lg text-sm transition-colors hover:border-brand-accent/50"
                    >
                      <span className={payoutMethod ? 'text-brand-text' : 'text-brand-muted'}>
                        {PAYOUT_OPTIONS.find(o => o.value === payoutMethod)?.label || 'Select payout method...'}
                      </span>
                      <svg
                        className={`w-4 h-4 text-brand-muted transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {dropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                        <div className="absolute z-20 mt-1 w-full bg-brand-card border border-brand-border rounded-lg shadow-lg shadow-black/30 overflow-hidden">
                          {PAYOUT_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => { setPayoutMethod(opt.value); setDropdownOpen(false); }}
                              className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                                payoutMethod === opt.value
                                  ? 'bg-brand-accent/15 text-brand-accent'
                                  : 'text-brand-text hover:bg-brand-surface'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  {payoutMethod && payoutMethod !== 'credit' && (
                    <input
                      type="text"
                      value={payoutDetail}
                      onChange={(e) => setPayoutDetail(e.target.value)}
                      placeholder={payoutMethod === 'paypal' ? 'PayPal email' : payoutMethod === 'venmo' ? 'Venmo handle' : 'Phone or email'}
                      className="w-full px-3 py-2.5 bg-brand-surface border border-brand-border rounded-lg text-brand-text text-sm placeholder:text-brand-muted mb-2"
                    />
                  )}
                  <button
                    onClick={async () => {
                      setPayoutSaving(true);
                      setRefMsg('');
                      try {
                        await api.put('/api/referral/payout-method', { method: payoutMethod, detail: payoutDetail });
                        setRefMsg('Saved!');
                        setTimeout(() => setRefMsg(''), 2000);
                      } catch (err) {
                        setRefMsg(err?.response?.data?.error || 'Failed to save');
                      } finally {
                        setPayoutSaving(false);
                      }
                    }}
                    disabled={!payoutMethod || payoutSaving}
                    className="px-4 py-2 rounded-lg border border-brand-border text-brand-text-secondary text-sm hover:bg-brand-surface transition-colors disabled:opacity-50"
                  >
                    {payoutSaving ? 'Saving...' : 'Save Payout Method'}
                  </button>
                  {refMsg && <span className="text-xs text-brand-accent ml-2">{refMsg}</span>}
                </div>

                {/* Cash out button */}
                <button
                  onClick={async () => {
                    setCashoutLoading(true);
                    setRefMsg('');
                    try {
                      await api.post('/api/referral/cashout');
                      setRefMsg('Cashout requested!');
                      const { data } = await api.get('/api/referral/stats');
                      setReferral(data);
                    } catch (err) {
                      setRefMsg(err?.response?.data?.error || 'Cashout failed');
                    } finally {
                      setCashoutLoading(false);
                    }
                  }}
                  disabled={cashoutLoading || referral.balanceCents < 10000 || referral.pendingCashoutCents > 0 || !payoutMethod}
                  className="w-full py-2.5 rounded-lg bg-brand-accent text-white text-sm font-semibold hover:bg-brand-accent-hover transition-colors disabled:opacity-50"
                >
                  {cashoutLoading ? 'Processing...' : referral.balanceCents < 10000 ? `Cash Out (min $100)` : 'Cash Out'}
                </button>

                {/* How it works */}
                <div className="bg-brand-surface/50 rounded-lg p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-brand-text-secondary">How cashout works</p>
                  <p className="text-xs text-brand-muted leading-relaxed">
                    You earn 30% from every payment your referrals make — subscriptions, renewals, and tips.
                    Once your balance reaches $100, choose a payout method and hit Cash Out.
                    We'll review and send payment within a few business days.
                  </p>
                </div>
              </div>
            ) : null)}
          </div>
        )}

        {/* Support */}
        <div className="bg-brand-card border border-brand-border rounded-xl p-5 mb-4">
          <h3 className="text-sm font-semibold text-brand-text mb-1">Support</h3>
          <p className="text-xs text-brand-muted mb-3">
            Have a question or need help? Chat with our support team.
          </p>
          <button
            onClick={() => navigate('/support')}
            className="w-full py-2.5 rounded-lg bg-brand-accent text-white text-sm font-semibold hover:bg-brand-accent-hover transition-colors"
          >
            Contact Support
          </button>
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
