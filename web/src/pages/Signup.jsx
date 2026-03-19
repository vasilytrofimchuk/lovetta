import { useState, useEffect } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { Browser } from '@capacitor/browser'
import { useAuth } from '../contexts/AuthContext'
import { getErrorMessage } from '../lib/api'
import AgeGate from '../components/AgeGate'
import GoogleSignIn from '../components/GoogleSignIn'
import TelegramSignIn from '../components/TelegramSignIn'
import AppleSignIn from '../components/AppleSignIn'
import { hasCompleteConsent, readOnboardingData, writeOnboardingData } from '../lib/onboarding'
import { isCapacitor } from '../lib/platform'
import { getAppPageHeight } from '../lib/layout'
import logoSrc from '../../../public/assets/brand/logo_text.png'

function openLink(url) {
  if (isCapacitor()) {
    Browser.open({ url, presentationStyle: 'popover' })
  } else {
    window.open(url, '_blank')
  }
}

function getAgeError(birthMonth, birthYear) {
  if (!birthMonth || !birthYear) return 'Please select your birth date'

  const now = new Date()
  const age = now.getFullYear() - parseInt(birthYear, 10) - (now.getMonth() + 1 < parseInt(birthMonth, 10) ? 1 : 0)
  if (age < 18) return 'You must be 18 or older to use Lovetta'

  return ''
}

export default function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const nativeApp = isCapacitor()
  const pageHeight = getAppPageHeight(nativeApp)
  const provider = searchParams.get('provider')
  const from = searchParams.get('from')
  const postSignupPath = nativeApp ? '/pricing' : '/pricing?onboarding=1'

  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [birthMonth, setBirthMonth] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [termsChecked, setTermsChecked] = useState(false)
  const [privacyChecked, setPrivacyChecked] = useState(false)
  const [aiConsentChecked, setAiConsentChecked] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const onboardingData = readOnboardingData()
    const prefilledEmail = searchParams.get('email')

    if (prefilledEmail) setEmail(prefilledEmail)
    if (onboardingData?.birthMonth) setBirthMonth(String(onboardingData.birthMonth))
    if (onboardingData?.birthYear) setBirthYear(String(onboardingData.birthYear))
    if (onboardingData?.termsAccepted) setTermsChecked(true)
    if (onboardingData?.privacyAccepted) setPrivacyChecked(true)
    if (onboardingData?.aiConsentAccepted) setAiConsentChecked(true)

    if ((from === 'telegram' || provider === 'google') && hasCompleteConsent(onboardingData)) {
      setStep(2)
    }
  }, [from, provider, searchParams])

  const consentData = birthMonth && birthYear ? {
    birthMonth: parseInt(birthMonth, 10),
    birthYear: parseInt(birthYear, 10),
    termsAccepted: termsChecked,
    privacyAccepted: privacyChecked,
    aiConsentAccepted: aiConsentChecked,
  } : null

  const persistOnboarding = () => {
    writeOnboardingData({
      birthMonth,
      birthYear,
      termsAccepted: termsChecked,
      privacyAccepted: privacyChecked,
      aiConsentAccepted: aiConsentChecked,
      postAuthPath: postSignupPath,
    })
  }

  const handleConsentContinue = () => {
    setError('')

    const ageError = getAgeError(birthMonth, birthYear)
    if (ageError) {
      setError(ageError)
      return
    }

    if (!termsChecked || !privacyChecked || !aiConsentChecked) {
      setError('Please accept all agreements')
      return
    }

    persistOnboarding()
    setStep(2)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!email || !password) {
      setError('Please fill in all fields')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    const ageError = getAgeError(birthMonth, birthYear)
    if (ageError) {
      setError(ageError)
      setStep(1)
      return
    }

    if (!termsChecked || !privacyChecked || !aiConsentChecked || !consentData) {
      setError('Please complete age verification first')
      setStep(1)
      return
    }

    setLoading(true)
    try {
      const referralCode = localStorage.getItem('lovetta-ref') || undefined
      await signup({
        email,
        password,
        birthMonth: consentData.birthMonth,
        birthYear: consentData.birthYear,
        termsAccepted: consentData.termsAccepted,
        privacyAccepted: consentData.privacyAccepted,
        aiConsentAccepted: consentData.aiConsentAccepted,
        referralCode,
      })
      if (nativeApp) {
        navigate(postSignupPath)
      } else {
        window.location.replace(`/my${postSignupPath}`)
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleSocialSuccess = () => {
    navigate(postSignupPath)
  }

  if (step === 1) {
    return (
      <div className="bg-brand-bg" style={{ height: pageHeight }}>
        <div className="app-scroll-region h-full overflow-y-auto flex items-center justify-center p-4">
          <div data-testid="signup-consent-shell" className="signup-consent-shell">
            <div className="text-center mb-5">
              <img src={logoSrc} alt="Lovetta" className="h-12 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-brand-text">Verify your age</h1>
              <p className="text-brand-text-secondary mt-2">You must be 18+ to use Lovetta</p>
            </div>

            <div className="space-y-5">
              <AgeGate
                birthMonth={birthMonth}
                birthYear={birthYear}
                onChange={({ birthMonth: month, birthYear: year }) => {
                  setBirthMonth(month)
                  setBirthYear(year)
                }}
              />

              <div className="space-y-1 pt-1">
                <label className="flex items-center gap-3 cursor-pointer py-3 px-1">
                  <input
                    type="checkbox"
                    checked={termsChecked}
                    onChange={(e) => setTermsChecked(e.target.checked)}
                    className="w-6 h-6 accent-brand-accent flex-shrink-0"
                  />
                  <span className="text-sm text-brand-text-secondary leading-relaxed">
                    I agree to the{' '}
                    <button type="button" onClick={() => openLink('https://lovetta.ai/terms.html')} className="text-brand-accent underline">
                      Terms of Service
                    </button>
                  </span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer py-3 px-1">
                  <input
                    type="checkbox"
                    checked={privacyChecked}
                    onChange={(e) => setPrivacyChecked(e.target.checked)}
                    className="w-6 h-6 accent-brand-accent flex-shrink-0"
                  />
                  <span className="text-sm text-brand-text-secondary leading-relaxed">
                    I agree to the{' '}
                    <button type="button" onClick={() => openLink('https://lovetta.ai/privacy.html')} className="text-brand-accent underline">
                      Privacy Policy
                    </button>
                  </span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer py-3 px-1">
                  <input
                    type="checkbox"
                    checked={aiConsentChecked}
                    onChange={(e) => setAiConsentChecked(e.target.checked)}
                    className="w-6 h-6 accent-brand-accent flex-shrink-0"
                  />
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
                type="button"
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
        </div>
      </div>
    )
  }

  return (
    <div className="bg-brand-bg" style={{ height: pageHeight }}>
      <div className="app-scroll-region h-full overflow-y-auto flex items-center justify-center p-4">
        <div data-testid="auth-form-shell" className="app-auth-shell">
          <div className="text-center mb-8">
            <img src={logoSrc} alt="Lovetta" className="h-12 mx-auto mb-4" />
            <h1 className="text-2xl font-bold">Create account</h1>
            <p className="text-brand-text-secondary mt-1">Your girlfriend is waiting</p>
          </div>

          <button
            type="button"
            onClick={() => {
              setError('')
              setStep(1)
            }}
            className="flex items-center gap-1 text-sm text-brand-accent mb-5"
          >
            ← Back
          </button>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-brand-text-secondary mb-1.5 font-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="your@email.com"
                className="w-full px-4 py-3 bg-brand-surface border border-brand-border rounded-lg text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent-glow"
              />
            </div>

            <div>
              <label className="block text-sm text-brand-text-secondary mb-1.5 font-medium">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="Min 8 characters"
                  className="w-full px-4 py-3 bg-brand-surface border border-brand-border rounded-lg text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent-glow pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-text text-sm"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {provider === 'google' && (
              <div className="text-sm text-brand-text-secondary bg-brand-surface border border-brand-border rounded-lg p-3">
                Continue with Google after age verification, or finish creating this account with email and password.
              </div>
            )}

            {error && (
              <div className="text-brand-error text-sm bg-brand-error/10 border border-brand-error/30 rounded-lg p-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 px-4 rounded-2xl bg-brand-accent text-white text-base font-semibold hover:bg-brand-accent-hover transition-colors disabled:opacity-60"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-brand-border" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-brand-bg px-3 text-brand-muted">or</span>
            </div>
          </div>

          <div className="mt-3">
            <AppleSignIn onError={setError} ageData={consentData} onSuccess={handleSocialSuccess} />
          </div>
          <div className="mt-3">
            <GoogleSignIn
              birthData={consentData}
              hideSeparator
              onSuccess={handleSocialSuccess}
              postAuthPath={postSignupPath}
            />
          </div>
          {!nativeApp && (
            <div className="mt-3">
              <TelegramSignIn onBeforeNavigate={persistOnboarding} />
            </div>
          )}

          <div className="mt-6 text-center text-sm text-brand-text-secondary">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-accent hover:underline font-medium">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
