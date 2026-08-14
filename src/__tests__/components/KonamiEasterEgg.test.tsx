import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('matter-js', () => {
    const noop = () => ({});
    const engine = { world: {} };
    return {
        default: {
            Engine: { create: () => engine, clear: vi.fn() },
            Render: { create: () => ({ canvas: document.createElement('canvas'), bounds: { max: {} }, options: {} }), run: vi.fn(), stop: vi.fn() },
            Runner: { create: noop, run: vi.fn(), stop: vi.fn() },
            Bodies: { rectangle: noop },
            Composite: { add: vi.fn(), clear: vi.fn() },
            Mouse: { create: noop },
            MouseConstraint: { create: noop },
            Body: { setPosition: vi.fn() },
        },
    };
});

import KonamiEasterEgg from '@/components/KonamiEasterEgg';

const KONAMI_SEQUENCE = [
    'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
    'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
    'b', 'a',
];

function pressKeys(keys: string[]) {
    keys.forEach(key => fireEvent.keyDown(window, { key }));
}

describe('KonamiEasterEgg', () => {
    it('ne rend rien tant que le code n\'est pas saisi', () => {
        const { container } = render(<KonamiEasterEgg />);
        expect(container.firstChild).toBeNull();
    });

    it('ne s\'active pas pour une séquence incorrecte', () => {
        const { container } = render(<KonamiEasterEgg />);
        pressKeys(['ArrowUp', 'ArrowDown', 'ArrowLeft']);
        expect(container.firstChild).toBeNull();
    });

    it('s\'active après la séquence correcte (happy path)', () => {
        render(<KonamiEasterEgg />);
        pressKeys(KONAMI_SEQUENCE);
        expect(screen.getByText('🎮 Konami Code Activé !')).toBeTruthy();
    });

    it('arrête la pluie au clic sur le bouton d\'arrêt', () => {
        render(<KonamiEasterEgg />);
        pressKeys(KONAMI_SEQUENCE);
        expect(screen.getByText('🎮 Konami Code Activé !')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Arrêter la pluie' }));
        expect(screen.queryByText('🎮 Konami Code Activé !')).toBeNull();
    });
});
