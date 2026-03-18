export default function DesktopShell({ children }) {
  return (
    <div className="bg-brand-bg relative" style={{ minHeight: 'var(--app-viewport-height, 100vh)' }}>
      {/* Background glows - only visible on desktop sides */}
      <div className="fixed inset-0 pointer-events-none hidden md:block overflow-hidden">
        <div className="desktop-glow-pink" />
        <div className="desktop-glow-purple" />
      </div>
      {/* Content column with frame on desktop */}
      <div
        className="relative z-10 md:max-w-[480px] md:mx-auto md:shadow-2xl md:shadow-black/50 md:border-x md:border-brand-border/30 bg-brand-bg"
        style={{ minHeight: 'var(--app-viewport-height, 100vh)' }}
      >
        {children}
      </div>
    </div>
  )
}
