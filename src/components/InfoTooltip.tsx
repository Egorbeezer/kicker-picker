import React, { useState, type ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import type { DypMode } from '../types';
import { Modal } from './Modal';
import { haptic } from '../utils/telegram';

interface InfoTooltipProps {
  title: string;
  ariaLabel?: string;
  children: ReactNode;
}

/**
 * Интерактивный тултип в виде кнопки (?) с пояснением в модальной карточке —
 * не обрезается контейнерами с overflow-hidden и удобно нажимается на смартфоне.
 */
export const InfoTooltip: React.FC<InfoTooltipProps> = ({ title, ariaLabel, children }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          haptic('light');
          setOpen(true);
        }}
        aria-label={ariaLabel || title}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#2ea6ff]/15 text-[#2ea6ff] border border-[#2ea6ff]/30 hover:bg-[#2ea6ff]/25 active:scale-90 transition-transform shrink-0 align-middle"
      >
        <HelpCircle size={13} />
      </button>

      {open && (
        <Modal title={title} onClose={() => setOpen(false)} closeLabel="Понятно">
          <div className="space-y-3 text-xs leading-relaxed text-[var(--muted)]">{children}</div>
        </Modal>
      )}
    </>
  );
};

export interface TournamentModeInfo {
  key: DypMode;
  emoji: string;
  title: string;
  badge: string;
  shortDesc: string;
  supportsSingles: boolean;
  supportsBuckets: boolean;
  kidExplanation: string;
  example: string;
  bestFor: string;
}

export const TOURNAMENT_MODE_CATALOG: TournamentModeInfo[] = [
  {
    key: 'monster',
    emoji: '🎲',
    title: 'Monster DYP',
    badge: 'Популярный',
    shortDesc: 'Новый напарник каждый раунд + умный подбор без повторов',
    supportsSingles: false,
    supportsBuckets: true,
    kidExplanation:
      'Представь, что перед каждой новой игрой все игроки тянут жребий и меняются напарниками. Программа следит, чтобы ты как можно реже играл с тем же другом и против одних и тех же соперников.',
    example: 'В 1-й игре Ваня играет с Петей, во 2-й с Машей, в 3-й с Олей.',
    bestFor: 'Для дружных тусовок и клубных вечеров, где побеждает самый универсальный игрок.',
  },
  {
    key: 'classic',
    emoji: '🤝',
    title: 'Classic DYP',
    badge: 'Постоянные пары',
    shortDesc: 'Компьютер собирает пары перед 1-м раундом, дальше играете вместе',
    supportsSingles: false,
    supportsBuckets: true,
    kidExplanation:
      'Компьютер всего один раз перед стартом случайно соединяет игроков по двое. Получившиеся команды уже не меняются до самого конца отбора!',
    example: 'Жребий свёл Ваню и Петю перед 1-й игрой: всю квалификацию они защищают одни ворота вдвоём.',
    bestFor: 'Когда хочется найти одного напарника, сыграться за вечер и стать командой мечты.',
  },
  {
    key: 'swiss',
    emoji: '♟️',
    title: 'Швейцарка (Swiss)',
    badge: '1×1 или 2×2',
    shortDesc: 'Лидеры встречаются с лидерами по очкам, равные битвы без вылета',
    supportsSingles: true,
    supportsBuckets: true,
    kidExplanation:
      'Никто не вылетает после поражения! После каждого раунда таблица смотрит, кто сколько побед набрал: победители играют с победителями, а те, кто пока уступил, со своими ровесниками по очкам.',
    example: 'У Коли и Димы по 2 победы: в 3-м туре они обязательно встретятся за одним столом.',
    bestFor: 'Для честных турниров, где каждый матч напряжённый и решает место в таблице.',
  },
  {
    key: 'round_robin',
    emoji: '🔄',
    title: 'Круговой (Round Robin)',
    badge: '1 или 2 круга',
    shortDesc: 'Каждый играет с каждым, 1 или 2 круга (1×1 или в парах)',
    supportsSingles: true,
    supportsBuckets: true,
    kidExplanation:
      'Всё по-честному: компьютер заранее составляет календарь так, чтобы абсолютно каждый игрок (или команда) сыграл против каждого соперника ровно один или два раза!',
    example: 'Если участвуют 6 игроков в 1 круг, каждый сыграет ровно 5 матчей и встретится со всеми.',
    bestFor: 'Когда участников немного и важно выяснить сильнейшего без случайностей жребия.',
  },
  {
    key: 'random_dyp',
    emoji: '🎰',
    title: 'Random DYP',
    badge: 'Чистый рандом',
    shortDesc: 'Чистый случайный жребий без алгоритма подбора Fair4All',
    supportsSingles: true,
    supportsBuckets: false,
    kidExplanation:
      'Настоящая лотерея! В каждом раунде программа просто перемешивает игроков вслепую и ставит к столам без сложных подсчётов прошлых встреч.',
    example: 'Может выпасть совсем новый напарник, а может тот же самый, что и в прошлый раз.',
    bestFor: 'Для весёлых быстрых игр «на удачу», где элемент сюрприза важнее расчётов.',
  },
  {
    key: 'whist',
    emoji: '🃏',
    title: 'Whist',
    badge: 'Макс. разнообразие',
    shortDesc: 'Максимальный приоритет: никогда не повторять напарников и соперников',
    supportsSingles: false,
    supportsBuckets: true,
    kidExplanation:
      'Старший брат Monster DYP: здесь жёсткое правило без повторных напарников и с минимумом повторных соперников, пока есть хотя бы один несыгранный вариант.',
    example: 'На 8 игроках за 3 раунда ты поиграешь в паре с разными людьми и ни разу не повторишься.',
    bestFor: 'Идеально, когда за столами 8, 12 или 16 человек и хочется сыграть идеальную ротацию.',
  },
  {
    key: 'last_one_standing',
    emoji: '❤️',
    title: 'Last One Standing',
    badge: 'На жизни',
    shortDesc: 'У всех по N жизней: проигрыш сжигает сердечко, побеждает последний!',
    supportsSingles: true,
    supportsBuckets: false,
    kidExplanation:
      'Как в видеоигре: на старте у каждого игрока есть например 3 сердечка. Проиграл матч, потерял 1 сердечко. Когда жизни кончились, игрок выбывает, а последний оставшийся становится чемпионом!',
    example: 'Когда в живых останутся только двое финалистов, они сойдутся в дуэли 1×1 за титул.',
    bestFor: 'Очень азартный режим на выбывание со зрителями и настоящей драмой!',
  },
  {
    key: 'elimination',
    emoji: '⚡',
    title: 'Сразу Плей-офф',
    badge: 'Без отбора',
    shortDesc: 'Мгновенная сетка на выбывание без раундов квалификации',
    supportsSingles: true,
    supportsBuckets: false,
    kidExplanation:
      'Никаких долгих отборочных раундов! Собрали участников, можно перемешать или выставить порядок посева вручную, и сразу в олимпийскую сетку на вылет.',
    example: 'Добавили 8 или 16 игроков, нажали старт: сразу четвертьфиналы и путь до финала.',
    bestFor: 'Быстрый кубок на вылет, когда времени мало или сетка уже определена заранее.',
  },
];

export function getDypModeLabel(mode?: string | null): string {
  const found = TOURNAMENT_MODE_CATALOG.find((m) => m.key === mode);
  return found ? found.title : 'Monster DYP';
}

export const ModeInfoTooltip: React.FC<{ mode: TournamentModeInfo }> = ({ mode }) => (
  <InfoTooltip title={`${mode.emoji} ${mode.title}`} ariaLabel={`Подробнее про ${mode.title}`}>
    <p className="text-[var(--text)] font-medium">{mode.kidExplanation}</p>
    <div className="bg-[var(--bg)] border border-[#2ea6ff]/30 rounded-2xl p-3 space-y-1">
      <div className="font-bold text-[#2ea6ff]">Простой пример</div>
      <p>{mode.example}</p>
    </div>
    <div className="bg-[var(--bg)] border border-emerald-500/30 rounded-2xl p-3 space-y-1">
      <div className="font-bold text-emerald-500">Когда выбирать?</div>
      <p>{mode.bestFor}</p>
    </div>
  </InfoTooltip>
);

export const DypModeTooltip: React.FC = () => (
  <InfoTooltip title="Как выбрать формат турнира?" ariaLabel="Подробнее про форматы турнира">
    <p>
      В зависимости от числа игроков и настроения можно выбрать <strong className="text-[var(--text)]">пары (2×2)</strong> или{' '}
      <strong className="text-[var(--text)]">одиночки (1×1)</strong>, а также систему подбора матчей:
    </p>
    <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
      {TOURNAMENT_MODE_CATALOG.map((m) => (
        <div key={m.key} className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-2xl p-3 space-y-1">
          <div className="font-bold text-xs text-[var(--text)] flex items-center justify-between gap-2">
            <span>
              {m.emoji} {m.title}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#2ea6ff]/15 text-[#2ea6ff]">{m.badge}</span>
          </div>
          <p>{m.kidExplanation}</p>
        </div>
      ))}
    </div>
  </InfoTooltip>
);

export const TieBreakersTooltip: React.FC = () => (
  <InfoTooltip title="Что значат Бухгольц (BH₁) и Зоннеборн–Бергер (SB)?" ariaLabel="Подробнее про Бухгольц и Зоннеборн-Бергер">
    <p>
      Когда два игрока набрали <strong className="text-[var(--text)]">одинаковое количество очков</strong>, эти показатели помогают
      понять, кто играл с более сильными соперниками:
    </p>
    <div className="bg-[var(--bg)] border border-[#2ea6ff]/35 rounded-2xl p-3 space-y-1.5">
      <div className="font-bold text-[#2ea6ff]">Бухгольц (BH₁) и Средний Бухгольц (ØBH)</div>
      <p>
        Считает сумму очков всех твоих соперников за квалификацию. Чем сильнее были твои оппоненты в сетке, тем выше твой BH₁.
      </p>
    </div>
    <div className="bg-[var(--bg)] border border-emerald-500/35 rounded-2xl p-3 space-y-1.5">
      <div className="font-bold text-emerald-500">Зоннеборн–Бергер (SB)</div>
      <p>
        Складывает очки только тех соперников, <strong className="text-[var(--text)]">кого ты победил</strong>. Победа над
        лидером приносит больше баллов SB, чем победа над аутсайдером!
      </p>
    </div>
  </InfoTooltip>
);

export const BucketsTooltip: React.FC = () => (
  <InfoTooltip title="Как работают корзины A / B?" ariaLabel="Подробнее про корзины A и B">
    <p>
      <strong className="text-[var(--text)]">Корзины A / B</strong> нужны для того, чтобы матчи были честными
      и интересными для всех, чтобы две «звезды» не играли против двух новичков.
    </p>

    <div className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-2xl p-3 space-y-2">
      <div className="font-bold text-[var(--text)]">Как это работает в 3 простых шага:</div>
      <div className="space-y-1">
        <p>
          1. Организатор в списке участников ставит каждому метку:{' '}
          <span className="font-bold text-amber-500">A</span> (опытный/сильный игрок) или{' '}
          <span className="font-bold text-[#2ea6ff]">B</span> (новичок/играет спокойнее).
        </p>
        <p>
          2. Когда компьютер собирает команды на раунд, он старается ставить в каждую пару{' '}
          <strong className="text-[var(--text)]">одного игрока из A и одного из B</strong>.
        </p>
        <p>
          3. Получается равная борьба: сильный игрок помогает новичку, а шансы на победу есть у
          каждого стола!
        </p>
      </div>
    </div>

    <div className="bg-[var(--bg)] border border-emerald-500/30 rounded-2xl p-3 space-y-1">
      <div className="font-bold text-emerald-500">Простой пример</div>
      <p>
        Есть двое профи (Ваня A, Костя A) и двое новичков (Лена B, Миша B). Вместо несправедливой
        игры «профи против новичков» программа сделает команды{' '}
        <strong className="text-[var(--text)]">(Ваня + Лена)</strong> против{' '}
        <strong className="text-[var(--text)]">(Костя + Миша)</strong>!
      </p>
    </div>

    <p className="text-[11px]">
      Если игроков A и B не поровну или кому-то ещё не поставили букву, ничего страшного: сначала
      соберутся все возможные пары A + B, а остальных компьютер распределит между собой.
    </p>
  </InfoTooltip>
);
