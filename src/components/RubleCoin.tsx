import React from 'react';
import headsImg from '../assets/coin-heads.jpg';
import tailsImg from '../assets/coin-tails.jpg';

interface RubleCoinProps {
  animate: boolean;
  result: 'Орёл' | 'Решка';
  size?: number;
}

export const RubleCoin: React.FC<RubleCoinProps> = ({ animate, result, size = 112 }) => {
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

      {/* Ground shadow */}
      <div
        className="mt-2 rounded-full bg-black/70 blur-[5px]"
        style={{
          width: size * 0.68,
          height: 10,
          animation: shadowAnimation,
          opacity: animate ? undefined : 0.45,
        }}
      />
    </div>
  );
};
