import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from 'react';

import styles from './Toast.module.css';

type Tone = 'success' | 'error';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  message: ReactNode;
  tone: Tone;
  action?: ToastAction;
}

/** The second argument is a tone or options with an action (e.g. "Undo") */
type Notify = (message: ReactNode, options?: Tone | { tone?: Tone; action?: ToastAction }) => void;

const DURATION_MS = 4000;
const DURATION_WITH_ACTION_MS = 6500;

const ToastContext = createContext<Notify>(() => {});

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback(
    (id: number) => setItems((current) => current.filter((item) => item.id !== id)),
    [],
  );

  const notify = useCallback<Notify>(
    (message, options) => {
      const { tone = 'success', action } =
        typeof options === 'string' ? { tone: options } : (options ?? {});
      const id = Date.now() + Math.random();
      setItems((current) => [...current, { id, message, tone, ...(action && { action }) }]);
      setTimeout(() => dismiss(id), action ? DURATION_WITH_ACTION_MS : DURATION_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => notify, [notify]);
  const regionRef = useRef<HTMLDivElement>(null);

  // Modals (<dialog>) live in the browser's top layer, above any z-index.
  // So the toast area is a popover: showing it again lifts it above an open dialog.
  useEffect(() => {
    const region = regionRef.current;
    if (!region || typeof region.showPopover !== 'function') return;
    if (region.matches(':popover-open')) region.hidePopover();
    if (items.length > 0) region.showPopover();
  }, [items]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div ref={regionRef} popover="manual" className={styles.region} aria-live="polite">
        {items.map(({ id, message, tone, action }) => (
          <div key={id} className={styles.toast} data-tone={tone}>
            <span>{message}</span>
            {action && (
              <button
                type="button"
                className={styles.action}
                onClick={() => {
                  dismiss(id);
                  action.onClick();
                }}
              >
                {action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// oxlint-disable-next-line react/only-export-components
export function useToast(): Notify {
  return useContext(ToastContext);
}
