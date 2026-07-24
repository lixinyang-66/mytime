/* eslint-disable @next/next/no-img-element */
'use client';

import type { CSSProperties } from 'react';
import { MOODS } from '@/lib/moods';

export default function MoodRainLoader() {
  const fallingMoods = Array.from({ length: 42 }, (_, index) => {
    const mood = MOODS[index % MOODS.length];
    const style = {
      left: `${(index * 37) % 102 - 2}%`,
      width: `${46 + (index % 4) * 12}px`,
      animationDelay: `-${(index % 10) * 0.73}s`,
      animationDuration: `${5.8 + (index % 6) * 0.7}s`,
      '--mood-drift': `${((index * 29) % 140) - 70}px`,
      '--mood-rotation': `${((index * 41) % 70) - 35}deg`,
    } as CSSProperties & Record<'--mood-drift' | '--mood-rotation', string>;

    return { mood, index, style };
  });

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#fff8ec]" aria-label="页面加载中" role="status">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,224,138,0.72),transparent_34rem),radial-gradient(circle_at_bottom_right,rgba(158,216,255,0.58),transparent_32rem)]" />
      {fallingMoods.map(({ mood, index, style }) => (
        <img
          key={`${mood.key}-${index}`}
          src={mood.src}
          alt=""
          className="mood-rain-item pointer-events-none absolute top-[-6rem] rounded-full object-cover shadow-xl"
          style={style}
        />
      ))}
    </div>
  );
}
