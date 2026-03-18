import { useState, useEffect, useRef } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getErrorMessage } from '../lib/api'
import AgeGate from '../components/AgeGate'
import LegalPopup from '../components/LegalPopup'
import GoogleSignIn from '../components/GoogleSignIn'
import TelegramSignIn from '../components/TelegramSignIn'
import AppleSignIn from '../components/AppleSignIn'
import { isCapacitor } from '../lib/platform'
import logoSrc from '../../../public/assets/brand/logo_text.png'
import { Browser } from '@capacitor/browser'

function openLink(url) {
  if (isCapacitor()) {
    Browser.open({ url, presentationStyle: 'popover' })
  } else {
    window.open(url, '_blank')
  }
}

export default function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // native steps: 1=consent, 2=account, 3=plan+payment
  const [step, setStep] = useState(1)
  const [selectedPlan, setSelectedPlan] = useState('yearly')
  const [purchaseLoading, setPurchaseLoading] = useState(false)
  const [purchaseError, setPurchaseError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [birthMonth, setBirthMonth] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [showLegal, setShowLegal] = useState(false)
  const [termsChecked, setTermsChecked] = useState(false)
  const [privacyChecked, setPrivacyChecked] = useState(false)
  const [aiConsentChecked, setAiConsentChecked] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const landingConsents = useRef(null)
  const nativeApp = isCapacitor()

  useEffect(() => {
    const from = searchParams.get('from')
    if (from === 'landing' || from === 'telegram') {
      try {
        const raw = localStorage.getItem('lovetta-landing-data')
        if (raw) {
          const data = JSON.parse(raw)
          if (data.birthMonth) setBirthMonth(String(data.birthMonth))
          if (data.birthYear) setBirthYear(String(data.birthYear))
          if (data.termsAccepted && data.privacyAccepted && data.aiConsentAccepted) {
            landingConsents.current = { termsAccepted: true, privacyAccepted: true, aiConsentAccepted: true }
          }
          if (data.selectedPlan) localStorage.setItem('lovetta-selected-plan', data.selectedPlan)
          localStorage.removeItem('lovetta-landing-data')
        }
      } catch {}
    }
  }, [searchParams])

  // Step 1 → Step 2
  const handleConsentContinue = () => {
    setError('')
    if (!birthMonth || !birthYear) { setError('Please select your birth date'); return }
    const now = new Date()
    const age = now.getFullYear() - parseInt(birthYear) - (now.getMonth() + 1 < parseInt(birthMonth) ? 1 : 0)
    if (age < 18) { setError('You must be 18 or older to use Lovetta'); return }
    if (!termsChecked || !privacyChecked || !aiConsentChecked) { setError('Please accept all agreements'); return }
    setStep(2)
  }

  // Account created → go to plan/payment screen
  const handleAccountCreated = () => {
    navigate('/pricing')
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    if (!email || !password || !birthMonth || !birthYear) { setError('Please fill in all fields'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    const now = new Date()
    const age = now.getFullYear() - parseInt(birthYear) - (now.getMonth() + 1 < parseInt(birthMonth) ? 1 : 0)
    if (age < 18) { setError('You must be 18 or older to use Lovetta'); return }
    if (nativeApp) {
      handleAccept({ termsAccepted: true, privacyAccepted: true, aiConsentAccepted: true })
      return
    }
    if (landingConsents.current) { handleAccept(landingConsents.current); return }
    setShowLegal(true)
  }

  const handleAccept = async ({ termsAccepted, privacyAccepted, aiConsentAccepted }) => {
    setShowLegal(false)
    setLoading(true)
    try {
      const referralCode = localStorage.getItem('lovetta-ref') || undefined
      await signup({ email, password, birthMonth: parseInt(birthMonth), birthYear: parseInt(birthYear), termsAccepted, privacyAccepted, aiConsentAccepted, referralCode })
      if (nativeApp) {
        handleAccountCreated()
      } else {
        navigate('/?newUser=true')
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // Purchase plan via RevenueCat
  const handlePurchase = async (plan) => {
    setPurchaseLoading(true)
    setPurchaseError('')
    try {
      const { getOfferings, purchasePackage } = await import('../lib/revenuecat')
      const offerings = await getOfferings()
      if (!offerings) throw new Error('Offerings not available')
      const pkg = plan === 'yearly'
        ? (offerings.annual || offerings.availablePackages?.find(p => p.identifier?.includes('year') || p.identifier?.includes('annual')))
        : (offerings.monthly || offerings.availablePackages?.find(p => p.identifier?.includes('month')))
      if (!pkg) throw new Error('Package not found')
      await purchasePackage(pkg)
      navigate('/')
    } catch (err) {
      if (err?.userCancelled || err?.code === 'PURCHASE_CANCELLED') return
      setPurchaseError(err?.message || 'Purchase failed')
    } finally {
      setPurchaseLoading(false)
    }
  }

  const consentData = birthMonth && birthYear ? {
    birthMonth: parseInt(birthMonth),
    birthYear: parseInt(birthYear),
    termsAccepted: nativeApp ? termsChecked : (landingConsents.current?.termsAccepted || false),
    privacyAccepted: nativeApp ? privacyChecked : (landingConsents.current?.privacyAccepted || false),
    aiConsentAccepted: nativeApp ? aiConsentChecked : (landingConsents.current?.aiConsentAccepted || false),
  } : null

  // NATIVE STEP 1: Age + Consent
  if (nativeApp && step === 1) {
    return (
      <div className="min-h-screen bg-brand-bg flex flex-col justify-center p-6">
        <div className="text-center mb-5">
          <img src={logoSrc} alt="Lovetta" className="h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-brand-text">Verify your age</h1>
          <p className="text-brand-text-secondary mt-2">You must be 18+ to use Lovetta</p>
        </div>

        <div className="space-y-5">
          <AgeGate
            birthMonth={birthMonth}
            birthYear={birthYear}
            onChange={({ birthMonth: m, birthYear: y }) => { setBirthMonth(m); setBirthYear(y) }}
          />

          <div className="space-y-1 pt-1">
            <label className="flex items-center gap-3 cursor-pointer py-3 px-1">
              <input type="checkbox" checked={termsChecked} onChange={e => setTermsChecked(e.target.checked)}
                className="w-6 h-6 accent-brand-accent flex-shrink-0" />
              <span className="text-sm text-brand-text-secondary leading-relaxed">
                I agree to the{' '}
                <button type="button" onClick={() => openLink('https://lovetta.ai/terms.html')} className="text-brand-accent underline">Terms of Service</button>
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer py-3 px-1">
              <input type="checkbox" checked={privacyChecked} onChange={e => setPrivacyChecked(e.target.checked)}
                className="w-6 h-6 accent-brand-accent flex-shrink-0" />
              <span className="text-sm text-brand-text-secondary leading-relaxed">
                I agree to the{' '}
                <button type="button" onClick={() => openLink('https://lovetta.ai/privacy.html')} className="text-brand-accent underline">Privacy Policy</button>
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer py-3 px-1">
              <input type="checkbox" checked={aiConsentChecked} onChange={e => setAiConsentChecked(e.target.checked)}
                className="w-6 h-6 accent-brand-accent flex-shrink-0" />
              <span className="text-sm text-brand-text-secondary leading-relaxed">
                I understand my messages are processed by AI services
              </span>
            </label>
          </div>

          {error && (
            <div className="text-brand-error text-sm bg-brand-error/10 border border-brand-error/30 rounded-lg p-3">
              {error}
            </div>
          )}

          <button
            onClick={handleConsentContinue}
            className="w-full py-3.5 bg-brand-accent text-white rounded-xl font-semibold text-base hover:bg-brand-accent-hover transition-colors"
          >
            Continue
          </button>

          <div className="text-center text-sm text-brand-text-secondary">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-accent font-medium">Sign in</Link>
          </div>
        </div>
      </div>
    )
  }

  // NATIVE STEP 3: Plan Selection + Payment
  if (nativeApp && step === 3) {
    return (
      <div className="min-h-screen bg-brand-bg flex flex-col justify-center px-5 py-8">
        <div className="text-center mb-5">
          <img src={logoSrc} alt="Lovetta" className="h-12 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-brand-text">Start Free Trial</h2>
          <p className="text-brand-text-secondary text-sm mt-1">Meet your AI girlfriend. Cancel anytime.</p>
        </div>

        {/* Plan cards — 2 columns */}
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          <button
            onClick={() => setSelectedPlan('monthly')}
            className={`relative rounded-lg p-4 text-center cursor-pointer transition-all border-[1.5px] bg-brand-surface ${
              selectedPlan === 'monthly'
                ? 'border-brand-accent shadow-[0_0_16px_rgba(214,51,108,0.3)]'
                : 'border-brand-border hover:border-brand-muted'
            }`}
          >
            <div className={`w-[18px] h-[18px] rounded-full border-2 mx-auto mb-2 transition-all ${
              selectedPlan === 'monthly'
                ? 'border-brand-accent bg-brand-accent shadow-[inset_0_0_0_3px_#1a1128]'
                : 'border-brand-border'
            }`} />
            <div className="text-[0.75rem] text-brand-muted uppercase tracking-wide font-semibold mb-1">Monthly</div>
            <div className="text-2xl font-extrabold text-brand-text leading-tight">$19.99</div>
            <div className="text-[0.78rem] text-brand-text-secondary mt-0.5">per month</div>
          </button>

          <button
            onClick={() => setSelectedPlan('yearly')}
            className={`relative rounded-lg p-4 text-center cursor-pointer transition-all border-[1.5px] bg-brand-surface ${
              selectedPlan === 'yearly'
                ? 'border-brand-accent shadow-[0_0_16px_rgba(214,51,108,0.3)]'
                : 'border-brand-border hover:border-brand-muted'
            }`}
          >
            <span className="absolute -top-[9px] left-1/2 -translate-x-1/2 bg-brand-accent text-white text-[0.65rem] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap">
              Best value
            </span>
            <div className={`w-[18px] h-[18px] rounded-full border-2 mx-auto mb-2 transition-all ${
              selectedPlan === 'yearly'
                ? 'border-brand-accent bg-brand-accent shadow-[inset_0_0_0_3px_#1a1128]'
                : 'border-brand-border'
            }`} />
            <div className="text-[0.75rem] text-brand-muted uppercase tracking-wide font-semibold mb-1">Yearly</div>
            <div className="text-2xl font-extrabold text-brand-text leading-tight">$99.99</div>
            <div className="text-[0.78rem] text-brand-text-secondary mt-0.5">per year</div>
            <div className="text-[0.7rem] text-green-400 font-semibold mt-1.5">$8.33/mo — save 58%</div>
          </button>
        </div>

        {/* Trial timeline */}
        <div className="flex items-start justify-center mb-3.5 px-4">
          <div className="flex flex-col items-center flex-1">
            <div className="w-2 h-2 rounded-full bg-brand-accent border-2 border-brand-accent shadow-[0_0_8px_rgba(214,51,108,0.3)] mb-1.5" />
            <div className="text-[0.68rem] font-bold text-brand-text leading-none">Today</div>
            <div className="text-[0.6rem] text-brand-muted mt-0.5 whitespace-nowrap">Full access, free</div>
          </div>
          <div className="h-px flex-1 min-w-4 bg-brand-border mt-1" />
          <div className="flex flex-col items-center flex-1">
            <div className="w-2 h-2 rounded-full bg-brand-card border-2 border-brand-muted mb-1.5" />
            <div className="text-[0.68rem] font-bold text-brand-text leading-none">Day 3</div>
            <div className="text-[0.6rem] text-brand-muted mt-0.5">Trial ends</div>
          </div>
          <div className="h-px flex-1 min-w-4 bg-brand-border mt-1" />
          <div className="flex flex-col items-center flex-1">
            <div className="w-2 h-2 rounded-full bg-brand-card border-2 border-brand-text-secondary mb-1.5" />
            <div className="text-[0.68rem] font-bold text-brand-text leading-none">Day 4</div>
            <div className="text-[0.6rem] text-brand-muted mt-0.5">First charge</div>
          </div>
        </div>

        {/* Features */}
        <ul className="list-none p-0 mb-3.5 space-y-1">
          {['Unlimited messages with your girlfriend', 'Unique personality & memory', 'Voice messages & photos'].map(f => (
            <li key={f} className="flex items-start gap-2 text-[0.82rem] text-brand-text-secondary">
              <span className="text-brand-accent font-bold text-[0.9rem] leading-none mt-px flex-shrink-0">✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>

        {/* Trial note + links */}
        <p className="text-[0.72rem] text-brand-muted text-center leading-snug mb-4">
          3-day free trial, then auto-renews. Cancel anytime — no charge during trial.{' '}
          <button type="button" onClick={() => openLink('https://lovetta.ai/privacy.html')} className="text-brand-accent underline">Privacy Policy</button>
          {' · '}
          <button type="button" onClick={() => openLink('https://lovetta.ai/terms.html')} className="text-brand-accent underline">Terms of Service</button>
        </p>

        {purchaseError && (
          <div className="text-brand-error text-sm bg-brand-error/10 border border-brand-error/30 rounded-lg p-3 mb-3">
            {purchaseError}
          </div>
        )}

        <button
          onClick={() => handlePurchase(selectedPlan)}
          disabled={purchaseLoading}
          className="w-full py-3.5 bg-brand-accent text-white rounded-xl font-semibold text-base hover:bg-brand-accent-hover transition-colors disabled:opacity-60"
        >
          {purchaseLoading ? 'Processing...' : 'Start Free Trial'}
        </button>

        <button
          onClick={() => navigate('/')}
          className="w-full py-3 text-brand-muted text-sm hover:text-brand-text-secondary transition-colors mt-2"
        >
          Skip for now
        </button>
      </div>
    )
  }

  // NATIVE STEP 2 or WEB: Account creation
  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={logoSrc} alt="Lovetta" className="h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-bold">Create account</h1>
          <p className="text-brand-text-secondary mt-1">Meet your AI girlfriend</p>
        </div>

        {nativeApp && (
          <button onClick={() => { setStep(1); setError('') }} className="flex items-center gap-1 text-sm text-brand-accent mb-5">
            ← Back
          </button>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-brand-text-secondary mb-1.5 font-medium">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
              placeholder="your@email.com"
              className="w-full px-4 py-3 bg-brand-surface border border-brand-border rounded-lg text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent-glow" />
          </div>

          <div>
            <label className="block text-sm text-brand-text-secondary mb-1.5 font-medium">Password</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                required autoComplete="new-password" placeholder="Min 8 characters"
                className="w-full px-4 py-3 bg-brand-surface border border-brand-border rounded-lg text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent-glow pr-12" />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-text text-sm">
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {!nativeApp && (
            <AgeGate birthMonth={birthMonth} birthYear={birthYear}
              onChange={({ birthMonth: m, birthYear: y }) => { setBirthMonth(m); setBirthYear(y) }} />
          )}

          {error && (
            <div className="text-brand-error text-sm bg-brand-error/10 border border-brand-error/30 rounded-lg p-3">{error}</div>
          )}

          <button type="submit" disabled={loading}
            className="w-full h-14 px-4 rounded-2xl bg-brand-accent text-white text-base font-semibold hover:bg-brand-accent-hover transition-colors disabled:opacity-60">
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-brand-border" /></div>
          <div className="relative flex justify-center text-sm"><span className="bg-brand-bg px-3 text-brand-muted">or</span></div>
        </div>
        <div className="mt-3">
          <AppleSignIn onError={setError} ageData={consentData} onSuccess={nativeApp ? handleAccountCreated : undefined} />
        </div>
        <div className="mt-3">
          <GoogleSignIn birthData={consentData} hideSeparator onSuccess={nativeApp ? handleAccountCreated : undefined} />
        </div>
        {!nativeApp && <div className="mt-3"><TelegramSignIn /></div>}

        <div className="mt-6 text-center text-sm text-brand-text-secondary">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-accent hover:underline font-medium">Sign in</Link>
        </div>
      </div>

      {showLegal && <LegalPopup onAccept={handleAccept} onClose={() => setShowLegal(false)} />}
    </div>
  )
}
