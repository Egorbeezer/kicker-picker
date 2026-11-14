import React, { useEffect, type ReactNode } from 'react';
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
  useEffect(() => {
    if (modalOpenTimer) {
      clearTimeout(modalOpenTimer);
      modalOpenTimer = null;
    }
    openModals += 1;
    document.body.classList.add('modal-open');

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
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
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal ${className}`.trim()}>
        <div className="modal-header">
          <div className="modal-title truncate">{title}</div>
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
