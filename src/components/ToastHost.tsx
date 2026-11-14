import React from 'react';
import { useToasts } from '../utils/toast';

/**
 * Контейнер всплывающих уведомлений (из библиотеки компонентов gym-gym-app).
 */
export const ToastHost: React.FC = () => {
  const items = useToasts();
  return (
    <div className="toast toast-top app-toast" role="status" aria-live="polite">
      {items.map((item) => (
        <div
          key={item.id}
          className={item.leaving ? 'toast-item is-leaving' : 'toast-item'}
          data-toast="message"
        >
          {item.text}
        </div>
      ))}
    </div>
  );
};
