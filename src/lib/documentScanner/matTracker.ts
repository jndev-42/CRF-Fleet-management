export interface Deletable {
    delete(): void;
}

/** Suivi des objets OpenCV (Mat, MatVector…) à libérer : le wasm ne les récupère pas tout seul. */
export function createTracker() {
    const items: Deletable[] = [];
    return {
        track<T extends Deletable>(item: T): T {
            items.push(item);
            return item;
        },
        release() {
            items.forEach((item) => item.delete());
        },
    };
}
