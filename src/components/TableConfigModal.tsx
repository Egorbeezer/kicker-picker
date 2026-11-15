import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Power } from 'lucide-react';
import type { TableColumnConfig, TableColumnKey } from '../types';
import { TieBreakersTooltip } from './InfoTooltip';
import { Modal } from './Modal';

export interface TableColumnMeta {
  key: TableColumnKey;
  label: string;
  shortLabel: string;
  defaultSort: boolean;
  defaultVisible: boolean;
  widthClass: string;
}

interface Props {
  config: TableColumnConfig[];
  metaByKey: Map<TableColumnKey, TableColumnMeta>;
  busy: boolean;
  onChange: (next: TableColumnConfig[]) => void;
  onResetDefault: () => void;
  onSave: (payload: TableColumnConfig[]) => Promise<void>;
  onClose: () => void;
}

export const TableConfigModal: React.FC<Props> = ({
  config,
  metaByKey,
  busy,
  onChange,
  onResetDefault,
  onSave,
  onClose,
}) => {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const moveRow = (index: number, delta: number) => {
    const nextIdx = index + delta;
    if (nextIdx < 0 || nextIdx >= config.length) return;
    const copy = [...config];
    [copy[index], copy[nextIdx]] = [copy[nextIdx], copy[index]];
    onChange(copy);
  };

  const reorderRow = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    if (fromIdx < 0 || fromIdx >= config.length || toIdx < 0 || toIdx >= config.length) return;
    const copy = [...config];
    const [moved] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, moved);
    onChange(copy);
  };

  return (
    <Modal
      title="Настройки таблицы"
      onClose={onClose}
      hideClose
      footer={
        <div className="btn-row">
          <button type="button" onClick={onResetDefault} className="btn btn-ghost">
            По умолчанию
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              await onSave(config);
            }}
            className="btn btn-primary"
          >
            Сохранить
          </button>
        </div>
      }
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] text-[var(--muted)] pb-1">
          <span>Перетаскивайте за ручку (⋮⋮) для изменения приоритета</span>
          <TieBreakersTooltip />
        </div>
        {config.map((col, idx) => {
          const meta = metaByKey.get(col.key);
          const isDragging = dragIndex === idx;
          const isDropTarget = dragOverIndex === idx && dragIndex !== null && dragIndex !== idx;
          return (
            <div
              key={col.key}
              data-col-idx={idx}
              data-testid={`col-row-${col.key}`}
              draggable
              onDragStart={(e) => {
                setDragIndex(idx);
                setDragOverIndex(idx);
                e.dataTransfer?.setData('text/plain', String(idx));
                if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverIndex !== idx) setDragOverIndex(idx);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const fromRaw = e.dataTransfer?.getData('text/plain');
                const fromIdx =
                  dragIndex ?? (fromRaw !== undefined && fromRaw !== '' ? Number(fromRaw) : idx);
                reorderRow(fromIdx, idx);
                setDragIndex(null);
                setDragOverIndex(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setDragOverIndex(null);
              }}
              className={`flex items-center justify-between bg-[var(--bg)] border rounded-2xl px-2.5 py-2 transition-all ${
                isDragging
                  ? 'opacity-50 border-[#2ea6ff]'
                  : isDropTarget
                    ? 'border-[#2ea6ff] bg-[#2ea6ff]/10'
                    : 'border-[var(--border-strong)]'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 pr-2">
                <button
                  type="button"
                  data-testid={`col-drag-handle-${col.key}`}
                  aria-label={`Перетащить ${meta?.label}`}
                  onPointerDown={(e) => {
                    setDragIndex(idx);
                    setDragOverIndex(idx);
                    const startTarget = e.currentTarget;
                    if (startTarget.setPointerCapture) {
                      try {
                        startTarget.setPointerCapture(e.pointerId);
                      } catch {}
                    }
                  }}
                  onPointerMove={(e) => {
                    if (dragIndex === null) return;
                    const el = document.elementFromPoint(e.clientX, e.clientY);
                    const rowEl = el?.closest?.('[data-col-idx]') as HTMLElement | null;
                    if (rowEl?.dataset?.colIdx !== undefined) {
                      const targetIdx = Number(rowEl.dataset.colIdx);
                      if (Number.isInteger(targetIdx) && targetIdx !== dragIndex) {
                        reorderRow(dragIndex, targetIdx);
                        setDragIndex(targetIdx);
                        setDragOverIndex(targetIdx);
                      }
                    }
                  }}
                  onPointerUp={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onPointerCancel={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  className="p-1.5 rounded-xl text-[var(--muted)] hover:text-[var(--text)] cursor-grab active:cursor-grabbing touch-none shrink-0"
                  title="Перетащите для смены порядка"
                >
                  <GripVertical size={16} />
                </button>
                <span className="text-xs sm:text-sm font-medium text-[var(--text)] truncate">
                  {meta?.label}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    onChange(config.map((c, i) => (i === idx ? { ...c, sort: !c.sort } : c)))
                  }
                  className={`p-1.5 rounded-xl transition-colors ${
                    col.sort ? 'text-[#2ea6ff] bg-[#2ea6ff]/15' : 'text-[var(--muted)] opacity-50'
                  }`}
                  title="Учитывать в сортировке"
                >
                  <Power size={15} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange(config.map((c, i) => (i === idx ? { ...c, visible: !c.visible } : c)))
                  }
                  className={`p-1.5 rounded-xl transition-colors ${
                    col.visible
                      ? 'text-[var(--text)] bg-[var(--card)]'
                      : 'text-[var(--muted)] opacity-50'
                  }`}
                  title="Показывать столбец"
                >
                  {col.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
                <div className="flex flex-col">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveRow(idx, -1)}
                    className="text-[var(--muted)] disabled:opacity-25 p-0.5"
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    type="button"
                    disabled={idx === config.length - 1}
                    onClick={() => moveRow(idx, 1)}
                    className="text-[var(--muted)] disabled:opacity-25 p-0.5"
                  >
                    <ArrowDown size={12} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
};
