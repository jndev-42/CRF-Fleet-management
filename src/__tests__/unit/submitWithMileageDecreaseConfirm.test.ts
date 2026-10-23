import { describe, it, expect, vi, afterEach } from 'vitest';
import { submitWithMileageDecreaseConfirm } from '@/components/vehicle/submitWithMileageDecreaseConfirm';

const decreaseResponse = () => new Response(JSON.stringify({
    error: 'Le kilométrage saisi est inférieur au kilométrage connu',
    code: 'MILEAGE_DECREASE_CONFIRM_REQUIRED',
}), { status: 400 });
const ok = () => new Response(JSON.stringify({ id: 't1' }), { status: 201 });

afterEach(() => vi.restoreAllMocks());

describe('submitWithMileageDecreaseConfirm', () => {
    it('renvoie directement une réponse sans demande de confirmation', async () => {
        const send = vi.fn().mockResolvedValue(ok());
        const res = await submitWithMileageDecreaseConfirm(send, 'Confirmer ?');
        expect(res?.status).toBe(201);
        expect(send).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenCalledWith(false);
    });

    it("laisse passer un autre 400 sans rien demander", async () => {
        const confirmSpy = vi.spyOn(window, 'confirm');
        const send = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Données invalides' }), { status: 400 }));
        const res = await submitWithMileageDecreaseConfirm(send, 'Confirmer ?');
        expect(res?.status).toBe(400);
        expect(await res!.json()).toEqual({ error: 'Données invalides' });
        expect(confirmSpy).not.toHaveBeenCalled();
    });

    it('demande confirmation avec le message du serveur puis renvoie avec confirmation', async () => {
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        const send = vi.fn().mockResolvedValueOnce(decreaseResponse()).mockResolvedValueOnce(ok());
        const res = await submitWithMileageDecreaseConfirm(send, 'Confirmer ?');
        expect(confirmSpy).toHaveBeenCalledWith('Le kilométrage saisi est inférieur au kilométrage connu\n\nConfirmer ?');
        expect(send).toHaveBeenNthCalledWith(2, true);
        expect(res?.status).toBe(201);
    });

    it("retourne null si l'utilisateur annule", async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        const send = vi.fn().mockResolvedValue(decreaseResponse());
        expect(await submitWithMileageDecreaseConfirm(send, 'Confirmer ?')).toBeNull();
        expect(send).toHaveBeenCalledTimes(1);
    });
});
