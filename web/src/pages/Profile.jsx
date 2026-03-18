import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import api from '../lib/api';
import { APP_ICON_OPTIONS, getCurrentAppIcon, getSavedAppIcon, saveAppIcon, setCurrentAppIcon } from '../lib/app-icon';
import { isAppStore, isCapacitor, isIOS } from '../lib/platform';
import RealEmailPrompt from '../components/RealEmailPrompt';

export default function Profile() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState(null);
  const [subLoading, setSubLoading] = useState(true);
  const [notifyMessages, setNotifyMessages] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [proactiveMessages, setProactiveMessages] = useState(true);
  const [proactiveFrequency, setProactiveFrequency] = useState('normal');
  const [explicitContent, setExplicitContent] = useState(false);
  const [appIcon, setAppIcon] = useState(() => getSavedAppIcon());
  const [appIconLoading, setAppIconLoading] = useState(isIOS());
  const [appIconSaving, setAppIconSaving] = useState(false);
  const [prefLoading, setPrefLoading] = useState(true);
  const [savingNotify, setSavingNotify] = useState(false);
  const [savingPush, setSavingPush] = useState(false);
  const [savingProactive, setSavingProactive] = useState(false);
  const [savingFrequency, setSavingFrequency] = useState(false);
  const [savingExplicit, setSavingExplicit] = useState(false);
  const [pushPromptVisible, setPushPromptVisible] = useState(false);
  const [pushPermissionDenied, setPushPermissionDenied] = useState(false);

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
  const ios = isIOS();
  const appStore = isAppStore();

  // Navigate to support if there are unread messages
  useEffect(() => {
    api.get('/api/support/unread')
      .then(({ data }) => { if (data.count > 0) navigate('/support'); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;

    api.get('/api/billing/status')
      .then(({ data }) => setSubscription(data))
      .catch(() => {})
      .finally(() => setSubLoading(false));

    api.get('/api/user/preferences')
      .then(({ data }) => {
        setNotifyMessages(data.notify_new_messages);
        setExplicitContent(data.explicit_content);
        setProactiveMessages(data.proactive_messages ?? true);
        setProactiveFrequency(data.proactive_frequency ?? 'normal');
      })
      .catch(() => {})
      .finally(() => setPrefLoading(false));

    // Check existing push subscription and show prompt if needed
    const dismissed = localStorage.getItem('push_prompt_dismissed');
    if (isCapacitor()) {
      import('@capacitor/push-notifications').then(({ PushNotifications }) => {
        PushNotifications.checkPermissions().then(status => {
          const granted = status.receive === 'granted';
          setPushEnabled(granted);
          setPushPermissionDenied(status.receive === 'denied');
          if (!granted && status.receive !== 'denied' && !dismissed) {
            setPushPromptVisible(true);
          }
        });
      }).catch(() => {});
    } else if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => {
          const hasSub = !!sub;
          setPushEnabled(hasSub);
          const denied = typeof Notification !== 'undefined' && Notification.permission === 'denied';
          setPushPermissionDenied(denied);
          if (!hasSub && !denied && !dismissed) {
            setPushPromptVisible(true);
          }
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

    if (ios) {
      getCurrentAppIcon()
        .then(({ icon }) => {
          const resolvedIcon = icon || getSavedAppIcon();
          if (!active) return;
          setAppIcon(resolvedIcon);
          saveAppIcon(resolvedIcon);
        })
        .catch((err) => {
          console.error('App icon load error:', err);
          if (active) setAppIcon(getSavedAppIcon());
        })
        .finally(() => {
          if (active) setAppIconLoading(false);
        });
    } else if (active) {
      setAppIconLoading(false);
    }

    return () => {
      active = false;
    };
  }, []);

  const toggleNotify = async () => {
    const newVal = !notifyMessages;
    setNotifyMessages(newVal);
    setSavingNotify(true);
    try {
      await api.put('/api/user/preferences', { notify_new_messages: newVal });
    } catch {
      setNotifyMessages(!newVal);
    } finally {
      setSavingNotify(false);
    }
  };

  const togglePush = async () => {
    if (savingPush) return;
    setSavingPush(true);
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
          // Check if previously denied — browser won't re-prompt
          if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
            toast('Push notifications are blocked. Please enable them in your browser settings.');
            return;
          }
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') return;

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
      setSavingPush(false);
    }
  };

  const toggleProactive = async () => {
    const newVal = !proactiveMessages;
    setProactiveMessages(newVal);
    setSavingProactive(true);
    try {
      await api.put('/api/user/preferences', { proactive_messages: newVal });
    } catch {
      setProactiveMessages(!newVal);
    } finally {
      setSavingProactive(false);
    }
  };

  const updateFrequency = async (val) => {
    const prev = proactiveFrequency;
    setProactiveFrequency(val);
    setSavingFrequency(true);
    try {
      await api.put('/api/user/preferences', { proactive_frequency: val });
    } catch {
      setProactiveFrequency(prev);
    } finally {
      setSavingFrequency(false);
    }
  };

  const toggleExplicit = async () => {
    const newVal = !explicitContent;
    setExplicitContent(newVal);
    setSavingExplicit(true);
    try {
      await api.put('/api/user/preferences', { explicit_content: newVal });
    } catch {
      setExplicitContent(!newVal);
    } finally {
      setSavingExplicit(false);
    }
  };

  const handlePushPromptAllow = async () => {
    setSavingPush(true);
    try {
      if (isCapacitor()) {
        const { registerNativePush } = await import('../lib/push-native');
        await registerNativePush();
        setPushEnabled(true);
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          if (permission === 'denied') setPushPermissionDenied(true);
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
    } catch (err) {
      console.error('Push prompt error:', err);
    } finally {
      setSavingPush(false);
      setPushPromptVisible(false);
    }
  };

  const dismissPushPrompt = () => {
    setPushPromptVisible(false);
    localStorage.setItem('push_prompt_dismissed', '1');
  };

  const handleAppIconSelect = async (nextIcon) => {
    if (appIconSaving || appIcon === nextIcon) return;

    setAppIconSaving(true);
    try {
      const { icon } = await setCurrentAppIcon(nextIcon);
      const resolvedIcon = icon || nextIcon;
      setAppIcon(resolvedIcon);
      saveAppIcon(resolvedIcon);
    } catch (err) {
      console.error('App icon update error:', err);
    } finally {
      setAppIconSaving(false);
    }
  };

  const showPushToggle = isCapacitor() || ('PushManager' in window);

  return (
    <div className="min-h-screen bg-brand-bg pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-brand-bg/95 backdrop-blur-sm border-b border-brand-border app-page-gutter py-3">
        <div className="w-full flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            aria-label="Back"
            title="Back"
            className="text-brand-muted hover:text-brand-text transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-brand-text">Profile</h1>
        </div>
      </div>
      <div className="app-page-gutter">
      <div className="w-full">

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

        {ios && (
          <div className="bg-brand-card border border-brand-border rounded-xl p-5 mb-4">
            <h3 className="text-sm font-semibold text-brand-text mb-1">App Icon</h3>
            <p className="text-xs text-brand-muted mb-4">
              Choose how Lovetta looks on your Home Screen.
            </p>

            {appIconLoading ? (
              <p className="text-sm text-brand-muted">Loading...</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {APP_ICON_OPTIONS.map((option) => {
                  const selected = appIcon === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => handleAppIconSelect(option.id)}
                      disabled={appIconSaving}
                      className={`rounded-xl border p-2.5 text-left transition-all ${
                        selected
                          ? 'border-brand-accent bg-brand-accent/10 ring-1 ring-brand-accent/30'
                          : 'border-brand-border bg-brand-surface hover:border-brand-accent/50'
                      } ${appIconSaving ? 'disabled:opacity-80' : ''}`}
                    >
                      <img
                        src={option.preview}
                        alt={`${option.label} icon preview`}
                        className="w-full rounded-[18px] mb-2 border border-black/5"
                      />
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-sm font-semibold text-brand-text leading-tight">{option.label}</span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold leading-none ${
                            selected
                              ? 'bg-brand-accent/15 text-brand-accent border border-brand-accent/30'
                              : 'bg-brand-bg/30 text-brand-muted border border-brand-border'
                          }`}
                        >
                          {selected ? 'Selected' : 'Use'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {!appIconLoading && (
              <p className="text-xs text-brand-muted mt-3">
                {appIconSaving ? 'Updating icon...' : 'Saved on this iPhone only.'}
              </p>
            )}
          </div>
        )}

        {/* Real email prompt for Apple relay/synthetic users */}
        <RealEmailPrompt />

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
                  if (subscription?.paymentProvider === 'revenuecat') {
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

        {/* Push permission prompt */}
        {pushPromptVisible && !pushEnabled && (
          <div className="bg-gradient-to-br from-brand-accent/15 to-brand-card border border-brand-accent/30 rounded-xl p-5 mb-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl flex-shrink-0">💌</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-brand-text mb-1">Don't miss her messages</p>
                <p className="text-xs text-brand-text-secondary mb-3">
                  Enable notifications so your girls can reach out to you anytime — even when you're not in the app.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handlePushPromptAllow}
                    disabled={savingPush}
                    className="px-4 py-2 rounded-lg bg-brand-accent text-white text-sm font-semibold hover:bg-brand-accent-hover transition-colors disabled:opacity-50"
                  >
                    {savingPush ? 'Enabling...' : 'Allow Notifications'}
                  </button>
                  <button
                    onClick={dismissPushPrompt}
                    className="px-3 py-2 rounded-lg text-brand-muted text-sm hover:text-brand-text-secondary transition-colors"
                  >
                    Not now
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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
                disabled={prefLoading || savingNotify}
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
                  disabled={prefLoading || savingPush}
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
                disabled={prefLoading || savingProactive}
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

            {/* Proactive message frequency — only shown when proactive is ON */}
            {proactiveMessages && (
              <div>
                <p className="text-sm text-brand-text mb-2">How often</p>
                <div className="flex rounded-lg overflow-hidden border border-brand-border">
                  {[
                    { value: 'low', label: 'Less' },
                    { value: 'normal', label: 'Normal' },
                    { value: 'high', label: 'More' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => updateFrequency(opt.value)}
                      disabled={prefLoading || savingFrequency}
                      className={`flex-1 py-2 text-xs font-medium transition-colors ${
                        proactiveFrequency === opt.value
                          ? 'bg-brand-accent text-white'
                          : 'bg-brand-surface text-brand-text-secondary hover:bg-brand-card'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-brand-muted mt-1">
                  {proactiveFrequency === 'low' && 'Up to 1 message per day'}
                  {proactiveFrequency === 'normal' && 'Morning & evening check-ins'}
                  {proactiveFrequency === 'high' && 'Morning, daytime & evening messages'}
                </p>
              </div>
            )}
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
                disabled={prefLoading || savingExplicit}
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

    </div>
  );
}
