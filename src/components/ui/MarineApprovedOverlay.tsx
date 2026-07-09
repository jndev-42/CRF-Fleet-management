'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import styles from './MarineApprovedOverlay.module.css';

interface MarineApprovedOverlayProps {
    onAnimationComplete: () => void;
    imageSrc?: string;
    stampText?: string;
}

export default function MarineApprovedOverlay({
    onAnimationComplete,
    imageSrc = "/big-marine.png",
    stampText = "MARINE APPROVED"
}: MarineApprovedOverlayProps) {
    const [step, setStep] = useState(0); // 0: init/backdrop, 1: photo, 2: seal, 3: stamp, 4: exit

    useEffect(() => {
        // Animation timeline:
        // t=0ms: show backdrop + image of Marine
        // t=600ms: show rotating spiky seal behind Marine
        // t=1400ms: stamp "Marine Approved" slams down on top + shakes the container
        // t=3200ms: start fading out the whole overlay
        // t=3700ms: trigger onAnimationComplete

        const t1 = setTimeout(() => setStep(1), 100);
        const t2 = setTimeout(() => setStep(2), 700);
        const t3 = setTimeout(() => setStep(3), 1500);
        const t4 = setTimeout(() => setStep(4), 3200);
        const t5 = setTimeout(() => {
            onAnimationComplete();
        }, 3700);

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
            clearTimeout(t4);
            clearTimeout(t5);
        };
    }, [onAnimationComplete]);

    // Generate points for a 24-point spiky seal/starburst
    const cx = 150;
    const cy = 150;
    const numPoints = 24;
    const innerRadius = 110;
    const outerRadius = 135;
    const pointsList: string[] = [];

    for (let i = 0; i < numPoints * 2; i++) {
        const angle = (i * Math.PI) / numPoints;
        const r = i % 2 === 0 ? outerRadius : innerRadius;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        pointsList.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    const pointsString = pointsList.join(' ');

    return (
        <div className={`${styles.overlay} ${step === 4 ? styles.fadeOut : ''}`}>
            <div className={styles.backdrop} />
            <div className={`${styles.contentContainer} ${step === 3 ? styles.shakeEffect : ''}`}>
                
                {/* 1. Spiky Seal (behind the image) */}
                {step >= 2 && (
                    <div className={styles.sealWrapper}>
                        <svg
                            viewBox="0 0 300 300"
                            className={styles.spikySeal}
                            aria-hidden="true"
                        >
                            {/* Outer gold glow/border */}
                            <polygon
                                points={pointsString}
                                fill="#fbbf24" /* gold amber-400 */
                                stroke="#d97706" /* amber-600 */
                                strokeWidth="6"
                                strokeLinejoin="round"
                            />
                            {/* Inner circle of the seal */}
                            <circle cx="150" cy="150" r="90" fill="#f59e0b" stroke="#b45309" strokeWidth="4" />
                            {/* Inner star detail */}
                            <path
                                d="M 150 110 L 162 135 L 189 139 L 169 158 L 174 185 L 150 172 L 126 185 L 131 158 L 111 139 L 138 135 Z"
                                fill="#ffffff"
                                opacity="0.8"
                            />
                        </svg>
                    </div>
                )}

                {/* 2. Image of Marine */}
                {step >= 1 && (
                    <div className={styles.imageWrapper}>
                        <Image
                            src={imageSrc}
                            alt={stampText}
                            width={200}
                            height={200}
                            className={styles.marineImage}
                            priority
                        />
                    </div>
                )}

                {/* 3. Stamp "Marine Approved" */}
                {step >= 3 && (
                    <div className={styles.stampWrapper}>
                        <div className={styles.stampText}>
                            {stampText}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
