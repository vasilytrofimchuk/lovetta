import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return ctx;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const show = useCallback((message, { type = 'error', duration = 4000 } = {}) => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    if (duration > 0) setTimeout(() => dismiss(id), duration);
    return id;
  }, []);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="fixed top-0 left-0 right-0 z-[9999] flex flex-col items-center pointer-events-none"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 1rem))' }}>
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const colors = {
    error: 'bg-red-900/90 border-red-700/50 text-red-100',
    success: 'bg-emerald-900/90 border-emerald-700/50 text-emerald-100',
    info: 'bg-brand-card/95 border-brand-border text-brand-text',
  };

  return (
    <div
      onClick={onDismiss}
      className={`pointer-events-auto mx-4 mb-2 px-4 py-3 rounded-xl border backdrop-blur-sm shadow-lg shadow-black/30
        text-sm max-w-sm w-full cursor-pointer transition-all duration-300
        ${colors[toast.type] || colors.info}
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}
    >
      {toast.message}
    </div>
  );
}
