import React from 'react';
import { Brand } from './Brand';

export interface BottomNavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  dot?: boolean;
  onClick: () => void;
}

/**
 * Плавающее нижнее меню (.dock) с подписью логотипа под ним (.footer-sign),
 * портировано из библиотеки компонентов gym-gym-app.
 */
export const BottomNav: React.FC<{ items: BottomNavItem[] }> = ({ items }) => {
  return (
    <>
      <nav className="dock" aria-label="Навигация">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.active ? 'dock-active' : undefined}
            onClick={item.onClick}
          >
            <span className="dock-icon-wrapper">
              <span className="dock-icon flex items-center justify-center">{item.icon}</span>
              {item.dot && <span className="tab-dot" />}
            </span>
            <span className="dock-label">{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="footer-sign">
        <Brand className="footer-brand" />
      </div>
    </>
  );
};
