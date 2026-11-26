import React from 'react';
import headsImg from '../assets/coin-heads.jpg';
import tailsImg from '../assets/coin-tails.jpg';

interface RubleCoinProps {
  animate: boolean;
  result: 'Орёл' | 'Решка';
  size?: number;
  label?: string | null;
  showShadow?: boolean;
}

export const RubleCoin: React.FC<RubleCoinProps> = ({
  animate,
  result,
  size = 112,
  label = null,
  showShadow = true,
}) => {
  const spinAnimation = animate
    ? `${result === 'Решка' ? 'coinSpinTails' : 'coinSpinHeads'} 4s cubic-bezier(0.12, 0.85, 0.22, 1) forwards`
    : undefined;

  const arcAnimation = animate
    ? 'coinTossArc 4s cubic-bezier(0.32, 0.08, 0.24, 1) forwards'
    : undefined;

  const shadowAnimation = animate
    ? 'coinTossShadow 4s cubic-bezier(0.32, 0.08, 0.24, 1) forwards'
    : undefined;

  const staticRotation = result === 'Решка' ? 'rotateX(180deg)' : 'rotateX(0deg)';

  return (
    <div className="relative flex flex-col items-center select-none" style={{ width: size }}>
      <div className="relative" style={{ width: size, height: size }}>
        <div
          style={{
            perspective: '1000px',
            width: size,
            height: size,
            animation: arcAnimation,
            willChange: animate ? 'transform' : undefined,
          }}
        >
        <div
          className="w-full h-full relative"
          style={{
            transformStyle: 'preserve-3d',
            transform: animate ? undefined : staticRotation,
            animation: spinAnimation,
            willChange: animate ? 'transform' : undefined,
          }}
        >
          {/* Front Face: Орёл */}
          <div
            className="absolute inset-0 rounded-full overflow-hidden ring-2 ring-gray-400/70 bg-gray-300 shadow-[0_8px_20px_rgba(0,0,0,0.55)]"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateX(0deg) translateZ(1.5px)',
            }}
          >
            <img
              src={headsImg}
              alt="Орёл — 1 рубль"
              loading="eager"
              decoding="sync"
              draggable={false}
              className="w-full h-full object-cover scale-[1.07]"
            />
          </div>

          {/* Metallic inner edge for realistic thickness when passing 90deg */}
          <div
            className="absolute inset-0 rounded-full bg-gradient-to-b from-gray-200 via-gray-400 to-gray-600"
            style={{ transform: 'translateZ(0px)' }}
          />

          {/* Back Face: Решка (1 РУБЛЬ) */}
          <div
            className="absolute inset-0 rounded-full overflow-hidden ring-2 ring-gray-400/70 bg-gray-300 shadow-[0_8px_20px_rgba(0,0,0,0.55)]"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateX(180deg) translateZ(1.5px)',
            }}
          >
            <img
              src={tailsImg}
              alt="Решка — 1 рубль"
              loading="eager"
              decoding="sync"
              draggable={false}
              className="w-full h-full object-cover scale-[1.07]"
            />
          </div>
        </div>
        </div>
        {label && (
          <div
            data-testid="coin-result-label"
            className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
          >
            <span
              style={{
                backgroundColor: 'rgba(14, 15, 12, 0.9)',
                color: '#ffffff',
                boxShadow:
                  '0 4px 16px rgba(0, 0, 0, 0.35), inset 0 0 0 1.5px rgba(255, 255, 255, 0.85)',
              }}
              className="px-4 py-1.5 rounded-full text-xl font-bold tracking-wide animate-fade-slide-up"
            >
              {label}
            </span>
          </div>
        )}
      </div>

      {/* Ground shadow */}
      {showShadow && (
        <div
          className="mt-2 rounded-full bg-black/70 blur-[5px]"
          style={{
            width: size * 0.68,
            height: 10,
            animation: shadowAnimation,
            opacity: animate ? undefined : 0.45,
          }}
        />
      )}
    </div>
  );
};
