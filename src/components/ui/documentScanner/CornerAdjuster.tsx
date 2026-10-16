'use client';

import React, { useRef } from 'react';
import { clamp, type Quad } from '@/lib/documentScanner/geometry';
import styles from '../DocumentScanner.module.css';

interface CornerAdjusterProps {
    imageUrl: string;
    width: number;
    height: number;
    quad: Quad;
    onChange: (quad: Quad) => void;
}

const CORNER_LABELS = ['haut gauche', 'haut droit', 'bas droit', 'bas gauche'];

/** Image figée + 4 poignées à glisser (tactile / souris) pour ajuster les coins du document. */
export default function CornerAdjuster({ imageUrl, width, height, quad, onChange }: CornerAdjusterProps) {
    const stageRef = useRef<HTMLDivElement>(null);
    const dragging = useRef<number | null>(null);

    const move = (e: React.PointerEvent) => {
        const index = dragging.current;
        const stage = stageRef.current;
        if (index === null || !stage) return;
        const rect = stage.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = clamp(((e.clientX - rect.left) / rect.width) * width, 0, width);
        const y = clamp(((e.clientY - rect.top) / rect.height) * height, 0, height);
        const next = [...quad] as Quad;
        next[index] = { x, y };
        onChange(next);
    };

    const points = quad.map((p) => `${p.x},${p.y}`).join(' ');

    return (
        <div
            ref={stageRef}
            className={`${styles.stage} ${styles.adjustStage}`}
            style={{ aspectRatio: `${width} / ${height}` }}
            onPointerMove={move}
            onPointerUp={() => { dragging.current = null; }}
            onPointerCancel={() => { dragging.current = null; }}
        >
            {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local (data URL) */}
            <img src={imageUrl} alt="Document capturé" className={styles.stageImage} draggable={false} />
            <svg className={styles.overlay} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
                <polygon points={points} className={styles.outline} vectorEffect="non-scaling-stroke" />
            </svg>
            {quad.map((p, i) => (
                <button
                    key={i}
                    type="button"
                    className={styles.handle}
                    style={{ left: `${(p.x / width) * 100}%`, top: `${(p.y / height) * 100}%` }}
                    aria-label={`Coin ${CORNER_LABELS[i]}`}
                    onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture?.(e.pointerId);
                        dragging.current = i;
                    }}
                />
            ))}
        </div>
    );
}
