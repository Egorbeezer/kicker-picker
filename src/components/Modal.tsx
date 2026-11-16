import React, { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

let openModals = 0;
let modalOpenTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Модальная карточка снизу экрана (портирована из gym-gym-app).
 * Управляет классом body.modal-open, чтобы нижнее меню скрывалось под открытой карточкой.
 */
export const Modal: React.FC<{
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  hideClose?: boolean;
  closeLabel?: string;
  className?: string;
}> = ({
  title,
  onClose,
  children,
  footer,
  hideClose = false,
  closeLabel = 'Закрыть',
  className = '',
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const prevFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (modalOpenTimer) {
      clearTimeout(modalOpenTimer);
      modalOpenTimer = null;
    }
    openModals += 1;
    document.body.classList.add('modal-open');

    const root = dialogRef.current;
    if (root && !root.contains(document.activeElement)) {
      const firstFocusable = root.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      (firstFocusable || root).focus({ preventScroll: true });
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      openModals = Math.max(0, openModals - 1);
      if (openModals === 0) {
        modalOpenTimer = setTimeout(() => {
          if (openModals === 0) {
            document.body.classList.remove('modal-open');
          }
          modalOpenTimer = null;
        }, 16);
      }
      if (prevFocused && prevFocused.isConnected) {
        prevFocused.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={dialogRef} tabIndex={-1} className={`modal ${className}`.trim()}>
        <div className="modal-header">
          <div id={titleId} className="modal-title truncate">{title}</div>
          <button
            type="button"
            className="modal-cancel-btn"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {(footer || !hideClose) && (
          <div className="modal-footer">
            {footer}
            {!hideClose && (
              <button type="button" className="btn modal-close" onClick={onClose}>
                {closeLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
