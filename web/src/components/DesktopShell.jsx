export default function DesktopShell({ children }) {
  return (
    <div className="bg-brand-bg relative" style={{ minHeight: 'var(--app-viewport-height, 100vh)' }}>
      {/* Background glows - only visible on desktop fine-pointer layouts */}
      <div className="desktop-shell-effects fixed inset-0 pointer-events-none overflow-hidden">
        <div className="desktop-glow-pink" />
        <div className="desktop-glow-purple" />
      </div>
      {/* Content column with frame on desktop fine-pointer layouts */}
      <div
        data-testid="app-shell"
        className="app-shell-width app-shell-frame relative z-10 bg-brand-bg"
        style={{ minHeight: 'var(--app-viewport-height, 100vh)' }}
      >
        {children}
      </div>
    </div>
  )
}
