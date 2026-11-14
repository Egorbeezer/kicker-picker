import React, { useId } from 'react';

interface Props {
  size?: number;
  className?: string;
}

/**
 * Иконка скриншота: рамка видоискателя по углам и камера в центре
 * с градиентом как на референсе пользователя.
 */
export const ScreenshotIcon: React.FC<Props> = ({ size = 22, className = '' }) => {
  const gradId = useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ec38bc" />
          <stop offset="52%" stopColor="#9656e8" />
          <stop offset="100%" stopColor="#5b86e5" />
        </linearGradient>
      </defs>

      {/* Углы рамки скриншота */}
      <path
        d="M8 20V14C8 10.6863 10.6863 8 14 8H20"
        stroke={`url(#${gradId})`}
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M44 8H50C53.3137 8 56 10.6863 56 14V20"
        stroke={`url(#${gradId})`}
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 44V50C8 53.3137 10.6863 56 14 56H20"
        stroke={`url(#${gradId})`}
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M56 44V50C56 53.3137 53.3137 56 50 56H44"
        stroke={`url(#${gradId})`}
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Контур камеры */}
      <path
        d="M21 22.5H24.2L26.2 19C26.75 18.05 27.75 17.5 28.85 17.5H35.15C36.25 17.5 37.25 18.05 37.8 19L39.8 22.5H43C46.0376 22.5 48.5 24.9624 48.5 28V41C48.5 44.0376 46.0376 46.5 43 46.5H21C17.9624 46.5 15.5 44.0376 15.5 41V28C15.5 24.9624 17.9624 22.5 21 22.5Z"
        stroke={`url(#${gradId})`}
        strokeWidth="4.6"
        strokeLinejoin="round"
      />

      {/* Объектив */}
      <circle
        cx="32"
        cy="34.5"
        r="6.2"
        stroke={`url(#${gradId})`}
        strokeWidth="4.6"
      />
    </svg>
  );
};
