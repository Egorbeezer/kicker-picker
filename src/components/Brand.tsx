import React from 'react';

/**
 * Логотип приложения («кикер пикер») шрифтом Unbounded
 * с двумя контрастными словами, в стиле Brand из gym-gym-app.
 */
export const Brand: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <span className={className ? `brand ${className}` : 'brand'}>
      <span className="brand-kicker">кикер</span>
      <span className="brand-picker">пикер</span>
    </span>
  );
};
