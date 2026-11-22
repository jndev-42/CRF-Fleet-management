'use client';

import React from 'react';
import styles from './VehicleCalendar.module.css';
import { CALENDAR_VIEW_LABELS, type CalendarViewMode } from '@/lib/calendarEvents';

interface CalendarViewSwitcherProps {
  view: CalendarViewMode;
  onChange: (view: CalendarViewMode) => void;
}

const VIEWS: CalendarViewMode[] = ['month', 'week', 'day'];

export default function CalendarViewSwitcher({ view, onChange }: CalendarViewSwitcherProps) {
  return (
    <div className={styles.viewSwitcher} role="group" aria-label="Vue du calendrier">
      {VIEWS.map(v => (
        <button
          key={v}
          type="button"
          className={`${styles.viewBtn} ${view === v ? styles.viewBtnActive : ''}`}
          aria-pressed={view === v}
          onClick={() => onChange(v)}
        >
          {CALENDAR_VIEW_LABELS[v]}
        </button>
      ))}
    </div>
  );
}
