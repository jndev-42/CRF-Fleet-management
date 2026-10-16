// Enveloppe ESM minimale : l'export d'OpenCV.js est un « thenable » qui se renvoie lui-même
// (Module.then(f) appelle f(Module)). Le retourner directement depuis un import() ou une
// Promise le ferait ré-adopter à l'infini : on l'expose donc dans une boîte.
import cvModule from '@techstark/opencv-js';

export function getOpenCvBox(): { cv: unknown } {
    return { cv: cvModule };
}
