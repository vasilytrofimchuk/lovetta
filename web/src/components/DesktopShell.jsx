export default function DesktopShell({ children }) {
  return (
    <div className="bg-brand-bg relative" style={{ minHeight: 'var(--app-viewport-height, 100vh)' }}>
      {/* Background glows - only visible on desktop sides */}
      <div className="fixed inset-0 pointer-events-none hidden lg:block overflow-hidden">
        <div className="desktop-glow-pink" />
        <div className="desktop-glow-purple" />
      </div>
      {/* Content column with frame on desktop */}
      <div
        data-testid="app-shell"
        className="app-shell-width relative z-10 bg-brand-bg lg:shadow-2xl lg:shadow-black/50 lg:border-x lg:border-brand-border/30"
        style={{ minHeight: 'var(--app-viewport-height, 100vh)' }}
      >
        {children}
      </div>
    </div>
  )
}
