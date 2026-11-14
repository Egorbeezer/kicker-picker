import React, { useState } from 'react';

interface PlayerAvatarProps {
  avatarUrl?: string | null;
  initials: string;
  name: string;
  isMe?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<PlayerAvatarProps['size']>, string> = {
  xs: 'w-5 h-5 text-[9px] border',
  sm: 'w-8 h-8 text-[11px] border-2',
  md: 'w-10 h-10 text-xs border-2',
  lg: 'w-16 h-16 text-lg border-2',
};

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  avatarUrl,
  initials,
  name,
  isMe = false,
  size = 'md',
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);

  const showImg = Boolean(avatarUrl) && !imgError;

  return (
    <div
      className={`${SIZE_CLASSES[size]} rounded-full overflow-hidden flex items-center justify-center font-bold shrink-0 ${
        isMe
          ? 'border-[#2ea6ff] bg-[#2ea6ff] text-white'
          : 'border-[var(--bg-2)] bg-[var(--bg-3)] text-[var(--text)]'
      } ${className}`}
      title={name}
    >
      {showImg ? (
        <img
          src={avatarUrl!}
          alt={name}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span>{isMe && size !== 'lg' ? 'Вы' : initials}</span>
      )}
    </div>
  );
};
