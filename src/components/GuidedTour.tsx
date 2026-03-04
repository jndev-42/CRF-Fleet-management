'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';

// ──────────────────────────────────────────────────────────────
// Tour Step Definitions
// ──────────────────────────────────────────────────────────────

interface TourStep {
    /** CSS selector or data-tour attribute to spotlight (null = full-screen info card) */
    target: string | null;
    /** Title of the tooltip/card */
    title: string;
    /** Body text (HTML supported) */
    body: string;
    /** Emoji icon displayed in the card header */
    icon: string;
    /** Preferred tooltip position relative to the target */
    position?: 'top' | 'bottom';
}

const TOUR_STEPS: TourStep[] = [
    // ── PART 1: Dashboard ──
    {
        target: null,
        title: 'Bienvenue ! 👋',
        body: "Ce petit guide va vous montrer comment utiliser l'application de gestion de flotte. C'est parti !",
        icon: '🚀',
    },
    {
        target: '[data-tour="stats"]',
        title: 'Résumé de la flotte',
        body: "Ces cartes affichent un résumé en temps réel : nombre total de véhicules, disponibles, en mission et en maintenance.",
        icon: '📊',
        position: 'bottom',
    },
    {
        target: '[data-tour="filters"]',
        title: 'Filtrer les véhicules',
        body: "Utilisez ces boutons pour filtrer rapidement les véhicules par statut : disponibles, en mission ou en maintenance.",
        icon: '🔍',
        position: 'bottom',
    },
    {
        target: '[data-tour="vehicle-card"]',
        title: 'Carte véhicule',
        body: "Chaque carte représente un véhicule. Vous y voyez son nom, immatriculation, statut et kilométrage. <strong>Cliquez dessus</strong> pour accéder à sa fiche détaillée.",
        icon: '🚗',
        position: 'bottom',
    },
    {
        target: '[data-tour="fuel-bar"]',
        title: 'Jauge carburant / batterie',
        body: "La jauge indique le niveau de carburant ou de batterie. Pour les véhicules connectés (Renault), les données remontent <strong>en temps réel</strong> avec l'autonomie restante.",
        icon: '⛽',
        position: 'top',
    },
    {
        target: '[data-tour="notifications"]',
        title: 'Notifications',
        body: "La cloche vous informe des alertes importantes : incidents signalés, anomalies kilométriques, etc. Un badge rouge apparaît quand vous avez des notifications non lues.",
        icon: '🔔',
        position: 'bottom',
    },
    {
        target: '[data-tour="aide"]',
        title: 'Page d\'aide',
        body: "Retrouvez ici les contacts d'urgence, les numéros utiles et un bouton pour <strong>relancer ce tutoriel</strong> à tout moment.",
        icon: '❓',
        position: 'bottom',
    },

    // ── PART 2: Check-out / Check-in (info cards, no spotlight) ──
    {
        target: null,
        title: 'Emprunter & Rendre un véhicule',
        body: "Voyons maintenant comment fonctionne le processus d'emprunt et de retour d'un véhicule. C'est la fonctionnalité principale de l'application !",
        icon: '🔑',
    },
    {
        target: null,
        title: 'Prendre un véhicule (Check-out)',
        body: `Depuis la fiche d'un véhicule <strong>disponible</strong>, cliquez sur <em>"🚗 Prendre le véhicule"</em>. Un formulaire vous demandera :<br/><br/>
        • <strong>Type de mission</strong> (DPS, PAPS, Maraude, etc.)<br/>
        • <strong>État du véhicule</strong> au départ<br/>
        • <strong>Photos</strong> avant départ (optionnel)<br/>
        • <strong>Vérification du DSA</strong> si le véhicule en est équipé<br/><br/>
        Votre identité est automatiquement remplie via votre compte Google.`,
        icon: '🚗',
    },
    {
        target: null,
        title: 'Le 2ème conducteur',
        body: `Vous pouvez ajouter un <strong>2ème conducteur</strong> de deux façons :<br/><br/>
        • <strong>Au moment du départ</strong> : dans le formulaire de check-out, un champ optionnel permet de le sélectionner<br/>
        • <strong>Pendant la mission</strong> : depuis la fiche véhicule, le bouton <em>"➕ Ajouter 2nd cond."</em> apparaît tant qu'aucun 2ème conducteur n'est assigné<br/><br/>
        Le 2ème conducteur pourra <strong>lui aussi rendre le véhicule</strong> à la fin de la mission.`,
        icon: '👥',
    },
    {
        target: null,
        title: 'Rendre un véhicule (Check-in)',
        body: `Quand la mission est terminée, cliquez sur <em>"✅ Rendre le véhicule"</em>. Le formulaire demande :<br/><br/>
        • <strong>Kilométrage</strong> et <strong>niveau de carburant</strong> actuels (sauf véhicules connectés)<br/>
        • <strong>Place de stationnement</strong> où vous garez le véhicule<br/>
        • <strong>État du véhicule</strong> et checklist (vitres, radio, tour du véhicule)<br/>
        • <strong>Incident</strong> éventuel à signaler<br/><br/>
        <strong>Qui peut rendre ?</strong> Le conducteur principal, le 2ème conducteur, ou un administrateur.`,
        icon: '✅',
    },
    {
        target: null,
        title: 'Vous êtes prêt ! 🎉',
        body: "Vous savez maintenant utiliser l'application. N'hésitez pas à consulter la page <strong>Aide</strong> pour retrouver les contacts utiles ou relancer ce tutoriel.<br/><br/>Bonne route ! 🚗",
        icon: '🎉',
    },
];

const LOCALSTORAGE_KEY = 'tour-completed';

// ──────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────

export default function GuidedTour() {
    const [isActive, setIsActive] = useState(false);
    const [step, setStep] = useState(0);
    const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);
    const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
    const [arrowClass, setArrowClass] = useState<'top' | 'bottom'>('top');
    const tooltipRef = useRef<HTMLDivElement>(null);
    const pathname = usePathname();
    const router = useRouter();

    // ── Start tour on first visit or when localStorage flag is cleared ──
    useEffect(() => {
        // Only start on the dashboard
        if (pathname !== '/') return;

        const completed = localStorage.getItem(LOCALSTORAGE_KEY);
        if (!completed) {
            // Small delay to let the page render first
            const timer = setTimeout(() => setIsActive(true), 800);
            return () => clearTimeout(timer);
        }
    }, [pathname]);

    // ── Listen for custom event to restart the tour ──
    useEffect(() => {
        function handleRestart() {
            setStep(0);
            setIsActive(true);
        }
        window.addEventListener('restart-tour', handleRestart);
        return () => window.removeEventListener('restart-tour', handleRestart);
    }, []);

    // ── Scroll target element into view when step changes ──
    useEffect(() => {
        if (!isActive) return;
        const currentStep = TOUR_STEPS[step];
        if (!currentStep?.target) return;

        const el = document.querySelector(currentStep.target);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [isActive, step]);

    // ── Position the tooltip relative to the target element ──
    // All coordinates are viewport-relative (position: fixed) so we
    // use getBoundingClientRect() directly without adding scroll offsets.
    const positionTooltip = useCallback(() => {
        const currentStep = TOUR_STEPS[step];
        if (!currentStep?.target) {
            setSpotlightRect(null);
            setTooltipStyle({});
            return;
        }

        const el = document.querySelector(currentStep.target);
        if (!el) {
            setSpotlightRect(null);
            setTooltipStyle({});
            return;
        }

        const rect = el.getBoundingClientRect();
        setSpotlightRect(rect);

        // Wait for tooltip to render so we can measure it
        requestAnimationFrame(() => {
            if (!tooltipRef.current) return;

            const tooltipHeight = tooltipRef.current.offsetHeight;
            const tooltipWidth = Math.min(380, window.innerWidth - 32);
            const padding = 16;
            const arrowOffset = 12;

            let top: number;
            let arrowPos: 'top' | 'bottom';

            const preferBottom = currentStep.position === 'bottom';
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;

            if (preferBottom && spaceBelow > tooltipHeight + padding + arrowOffset) {
                top = rect.bottom + arrowOffset;
                arrowPos = 'top';
            } else if (!preferBottom && spaceAbove > tooltipHeight + padding + arrowOffset) {
                top = rect.top - tooltipHeight - arrowOffset;
                arrowPos = 'bottom';
            } else if (spaceBelow > spaceAbove) {
                top = rect.bottom + arrowOffset;
                arrowPos = 'top';
            } else {
                top = rect.top - tooltipHeight - arrowOffset;
                arrowPos = 'bottom';
            }

            // Horizontal centering (viewport-relative)
            let left = rect.left + rect.width / 2 - tooltipWidth / 2;
            left = Math.max(padding, Math.min(left, window.innerWidth - tooltipWidth - padding));

            setTooltipStyle({
                top: `${top}px`,
                left: `${left}px`,
                width: `${tooltipWidth}px`,
            });
            setArrowClass(arrowPos);
        });
    }, [step]);

    useEffect(() => {
        if (!isActive) return;
        // Small delay to let scrollIntoView finish before positioning
        const timer = setTimeout(positionTooltip, 350);

        window.addEventListener('resize', positionTooltip);
        window.addEventListener('scroll', positionTooltip, true);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', positionTooltip);
            window.removeEventListener('scroll', positionTooltip, true);
        };
    }, [isActive, step, positionTooltip]);

    // ── Navigation ──
    function next() {
        if (step < TOUR_STEPS.length - 1) {
            setStep(step + 1);
        } else {
            finish();
        }
    }

    function prev() {
        if (step > 0) setStep(step - 1);
    }

    function finish() {
        setIsActive(false);
        setStep(0);
        localStorage.setItem(LOCALSTORAGE_KEY, 'true');
    }

    // ── Render ──
    if (!isActive) return null;

    const currentStep = TOUR_STEPS[step];
    const isInfoCard = !currentStep.target;
    const isLastStep = step === TOUR_STEPS.length - 1;
    const isFirstStep = step === 0;

    // Build clip-path for the spotlight hole (viewport-relative, no scroll offset)
    let clipPath: string | undefined;
    if (spotlightRect && !isInfoCard) {
        const pad = 8;
        const x = spotlightRect.left - pad;
        const y = spotlightRect.top - pad;
        const w = spotlightRect.width + pad * 2;
        const h = spotlightRect.height + pad * 2;
        const r = 12;
        clipPath = `
            polygon(
                0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
                ${x + r}px ${y}px,
                ${x + w - r}px ${y}px,
                ${x + w}px ${y + r}px,
                ${x + w}px ${y + h - r}px,
                ${x + w - r}px ${y + h}px,
                ${x + r}px ${y + h}px,
                ${x}px ${y + h - r}px,
                ${x}px ${y + r}px,
                ${x + r}px ${y}px
            )
        `;
    }

    const portal = (
        <div className="tour-overlay-wrapper">
            {/* Dark overlay with spotlight hole */}
            <div
                className="tour-overlay"
                style={clipPath ? { clipPath } : undefined}
                onClick={finish}
            />

            {/* Info card (centered, no spotlight) */}
            {isInfoCard && (
                <div className="tour-info-card" key={step}>
                    <div className="tour-info-icon">{currentStep.icon}</div>
                    <h3 className="tour-info-title">{currentStep.title}</h3>
                    <div
                        className="tour-info-body"
                        dangerouslySetInnerHTML={{ __html: currentStep.body }}
                    />
                    <div className="tour-controls">
                        <div className="tour-controls-left">
                            {!isFirstStep && (
                                <button className="tour-btn tour-btn-back" onClick={prev}>
                                    ← Précédent
                                </button>
                            )}
                        </div>
                        <div className="tour-progress">
                            {TOUR_STEPS.map((_, i) => (
                                <span key={i} className={`tour-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`} />
                            ))}
                        </div>
                        <div className="tour-controls-right">
                            {!isLastStep && (
                                <button className="tour-btn tour-btn-skip" onClick={finish}>
                                    Passer
                                </button>
                            )}
                            <button className="tour-btn tour-btn-next" onClick={next}>
                                {isLastStep ? "C'est parti ! 🚀" : 'Suivant →'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Tooltip (positioned near spotlight) */}
            {!isInfoCard && (
                <div
                    ref={tooltipRef}
                    className={`tour-tooltip tour-arrow-${arrowClass}`}
                    style={tooltipStyle}
                    key={step}
                >
                    <div className="tour-tooltip-header">
                        <span className="tour-tooltip-icon">{currentStep.icon}</span>
                        <span className="tour-tooltip-title">{currentStep.title}</span>
                    </div>
                    <div
                        className="tour-tooltip-body"
                        dangerouslySetInnerHTML={{ __html: currentStep.body }}
                    />
                    <div className="tour-controls">
                        <div className="tour-controls-left">
                            {!isFirstStep && (
                                <button className="tour-btn tour-btn-back" onClick={prev}>
                                    ←
                                </button>
                            )}
                        </div>
                        <div className="tour-progress">
                            {TOUR_STEPS.map((_, i) => (
                                <span key={i} className={`tour-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`} />
                            ))}
                        </div>
                        <div className="tour-controls-right">
                            <button className="tour-btn tour-btn-skip" onClick={finish}>
                                Passer
                            </button>
                            <button className="tour-btn tour-btn-next" onClick={next}>
                                Suivant →
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    // Render via portal to avoid z-index issues
    if (typeof document === 'undefined') return null;
    return createPortal(portal, document.body);
}
