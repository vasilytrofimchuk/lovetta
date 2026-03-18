export default function TelegramSignIn({ onBeforeNavigate }) {
  return (
    <a
      href="https://t.me/lovetta_bot?start=auth"
      onClick={() => onBeforeNavigate?.()}
      className="w-full h-14 px-4 rounded-2xl border border-brand-border bg-brand-surface text-brand-text text-base font-semibold hover:bg-brand-card transition-colors flex items-center justify-center gap-3 no-underline"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="#27A7E7">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.692-1.653-1.123-2.678-1.799-1.185-.781-.417-1.21.258-1.911.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.329-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.099-.002.321.023.465.141.12.098.153.229.169.339.016.11.035.322.02.496z"/>
      </svg>
      Continue with Telegram
    </a>
  )
}
