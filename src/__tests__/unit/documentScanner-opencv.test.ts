import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Faux module OpenCV.js : même piège que le vrai (`then` qui se renvoie lui-même)
interface FakeCv {
    Mat?: unknown;
    then?: (f: (m: FakeCv) => void) => void;
    onRuntimeInitialized?: () => void;
}

const state = vi.hoisted(() => ({ cv: null as unknown }));

vi.mock('@/lib/documentScanner/opencvModule', () => ({
    getOpenCvBox: () => ({ cv: state.cv }),
}));

function makeFakeCv(initialised: boolean): FakeCv {
    const cv: FakeCv = {
        then(f) {
            f(cv);
        },
    };
    if (initialised) cv.Mat = function Mat() {};
    return cv;
}

async function freshLoader() {
    vi.resetModules();
    return import('@/lib/documentScanner/opencv');
}

describe('documentScanner/opencv — loadOpenCv', () => {
    beforeEach(() => {
        state.cv = makeFakeCv(true);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('résout avec le module sans `then` (pas de ré-adoption infinie)', async () => {
        const { loadOpenCv } = await freshLoader();
        const cv = (await loadOpenCv()) as unknown as FakeCv;
        expect(cv.then).toBeUndefined();
        expect(typeof cv.Mat).toBe('function');
    });

    it('attend onRuntimeInitialized quand le wasm n\'est pas prêt', async () => {
        const fake = makeFakeCv(false);
        state.cv = fake;
        const { loadOpenCv } = await freshLoader();

        let done = false;
        const promise = loadOpenCv().then((cv) => {
            done = true;
            return cv;
        });
        await vi.waitFor(() => expect(typeof fake.onRuntimeInitialized).toBe('function'));
        expect(done).toBe(false);

        fake.Mat = function Mat() {};
        fake.onRuntimeInitialized?.();
        const cv = (await promise) as unknown as FakeCv;
        expect(cv.then).toBeUndefined();
    });

    it('met le résultat en cache', async () => {
        const { loadOpenCv } = await freshLoader();
        const first = loadOpenCv();
        expect(loadOpenCv()).toBe(first);
        await first;
        expect(loadOpenCv()).toBe(first);
    });

    it('réinitialise le cache après un échec', async () => {
        vi.useFakeTimers();
        state.cv = makeFakeCv(false);
        const { loadOpenCv, OPENCV_LOAD_TIMEOUT_MS } = await freshLoader();

        const failing = loadOpenCv();
        const assertion = expect(failing).rejects.toThrow();
        await vi.advanceTimersByTimeAsync(OPENCV_LOAD_TIMEOUT_MS + 1);
        await assertion;

        state.cv = makeFakeCv(true);
        const retry = loadOpenCv();
        expect(retry).not.toBe(failing);
        await expect(retry).resolves.toBeTruthy();
    });

    it('rejette si l\'initialisation dépasse le délai', async () => {
        vi.useFakeTimers();
        state.cv = makeFakeCv(false);
        const { loadOpenCv, OPENCV_LOAD_TIMEOUT_MS } = await freshLoader();

        const promise = loadOpenCv();
        const assertion = expect(promise).rejects.toThrow(/Délai dépassé/);
        await vi.advanceTimersByTimeAsync(OPENCV_LOAD_TIMEOUT_MS - 1);
        await vi.advanceTimersByTimeAsync(2);
        await assertion;
    });
});
