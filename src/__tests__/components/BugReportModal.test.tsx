/**
 * Tests du composant BugReportModal.
 *
 * Vérifie :
 *  - rendu initial du formulaire (titre, description, boutons)
 *  - affichage/masquage de la section "logs techniques"
 *  - soumission happy path → état "succès" + message "Rapport envoyé !"
 *  - désactivation du bouton submit si titre vide
 *  - affichage d'une erreur inline si l'API répond avec une erreur
 *  - appel de onClose au clic sur Annuler ou ✕
 *
 * Fichiers testés : src/components/BugReportModal.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BugReportModal from '@/components/BugReportModal';
import type { ConsoleLogEntry, NetworkLogEntry } from '@/lib/bugReportLogger';

const consoleLogs: ConsoleLogEntry[] = [
  { timestamp: '2026-03-12T10:00:00Z', level: 'error', message: 'TypeError: Cannot read' },
];
const networkLogs: NetworkLogEntry[] = [
  { timestamp: '2026-03-12T10:00:01Z', method: 'GET', url: '/api/vehicles', status: 200, duration: 42 },
];

function renderModal(onClose = vi.fn()) {
  return render(
    <BugReportModal consoleLogs={consoleLogs} networkLogs={networkLogs} onClose={onClose} />
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('BugReportModal — rendu initial', () => {
  it('affiche le titre de la modale', () => {
    renderModal();
    expect(screen.getByText('Signaler un bug')).toBeTruthy();
  });

  it('affiche le champ Titre et le champ Description', () => {
    renderModal();
    expect(screen.getByLabelText(/Titre/)).toBeTruthy();
    expect(screen.getByLabelText(/Description/)).toBeTruthy();
  });

  it('affiche le bouton "Envoyer le rapport" désactivé si le titre est vide', () => {
    renderModal();
    const submitBtn = screen.getByRole('button', { name: /Envoyer le rapport/i });
    expect((submitBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('active le bouton submit dès que le titre est renseigné', () => {
    renderModal();
    fireEvent.change(screen.getByLabelText(/Titre/), { target: { value: 'Bug urgent' } });
    const submitBtn = screen.getByRole('button', { name: /Envoyer le rapport/i });
    expect((submitBtn as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('BugReportModal — section logs techniques', () => {
  it('la section logs est repliée par défaut', () => {
    renderModal();
    // Le pre contenant les logs ne doit pas être visible
    expect(screen.queryByText(/TypeError: Cannot read/)).toBeNull();
  });

  it('affiche les logs après un clic sur le toggle', () => {
    renderModal();
    fireEvent.click(screen.getByText(/Logs techniques/i));
    expect(screen.getByText(/TypeError: Cannot read/)).toBeTruthy();
  });

  it('affiche le nombre de logs dans le libellé du toggle', () => {
    renderModal();
    expect(screen.getByText(/1 console, 1 réseau/)).toBeTruthy();
  });
});

describe('BugReportModal — fermeture', () => {
  it('appelle onClose au clic sur le bouton ✕', () => {
    const onClose = vi.fn();
    renderModal(onClose);
    fireEvent.click(screen.getByLabelText('Fermer la modale'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('appelle onClose au clic sur Annuler', () => {
    const onClose = vi.fn();
    renderModal(onClose);
    fireEvent.click(screen.getByRole('button', { name: /Annuler/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('appelle onClose au clic sur l\'overlay', () => {
    const onClose = vi.fn();
    renderModal(onClose);
    fireEvent.click(document.querySelector('.modal-overlay')!);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('BugReportModal — soumission', () => {
  it('affiche "Rapport envoyé !" après une soumission réussie', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ issueUrl: 'https://github.com/issues/1' }),
    } as Response);

    renderModal();
    fireEvent.change(screen.getByLabelText(/Titre/), { target: { value: 'Crash au démarrage' } });
    fireEvent.click(screen.getByRole('button', { name: /Envoyer le rapport/i }));

    await waitFor(() => {
      expect(screen.getByText(/Rapport envoyé !/i)).toBeTruthy();
    });
  });

  it('envoie les logs et networkLogs dans le body fetch', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ issueUrl: 'https://github.com/issues/1' }),
    } as Response);

    renderModal();
    fireEvent.change(screen.getByLabelText(/Titre/), { target: { value: 'Test' } });
    fireEvent.click(screen.getByRole('button', { name: /Envoyer le rapport/i }));

    await waitFor(() => screen.getByText(/Rapport envoyé !/i));

    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string) as Record<string, string>;
    expect(body.logs).toContain('TypeError: Cannot read');
    expect(body.networkLogs).toContain('/api/vehicles');
  });

  it('affiche une erreur inline si l\'API retourne une erreur', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Erreur lors de la création du ticket GitHub' }),
    } as Response);

    renderModal();
    fireEvent.change(screen.getByLabelText(/Titre/), { target: { value: 'Test' } });
    fireEvent.click(screen.getByRole('button', { name: /Envoyer le rapport/i }));

    await waitFor(() => {
      expect(screen.getByText(/Erreur lors de la création du ticket GitHub/i)).toBeTruthy();
    });
  });

  it('affiche "Erreur de connexion" si fetch lève une exception', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

    renderModal();
    fireEvent.change(screen.getByLabelText(/Titre/), { target: { value: 'Test' } });
    fireEvent.click(screen.getByRole('button', { name: /Envoyer le rapport/i }));

    await waitFor(() => {
      expect(screen.getByText(/Erreur de connexion/i)).toBeTruthy();
    });
  });

  it('désactive le bouton submit pendant la soumission', async () => {
    let resolvePromise!: (v: Response) => void;
    vi.spyOn(global, 'fetch').mockReturnValue(new Promise(res => { resolvePromise = res; }) as Promise<Response>);

    renderModal();
    fireEvent.change(screen.getByLabelText(/Titre/), { target: { value: 'Test' } });
    fireEvent.click(screen.getByRole('button', { name: /Envoyer le rapport/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Envoi.../i })).toBeTruthy();
    });
    const btn = screen.getByRole('button', { name: /Envoi.../i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);

    // Résoudre la promesse pour éviter les fuites
    resolvePromise({ ok: true, json: async () => ({ issueUrl: '' }) } as Response);
  });
});
