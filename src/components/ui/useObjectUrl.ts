import { useEffect, useRef, type RefObject } from 'react';

/**
 * Aperçu d'une image locale : renvoie la référence à poser sur l'`<img>`, sans attribut
 * `src`. L'URL `blob:` est créée dans un effet (le rendu reste pur), écrite sur l'élément,
 * puis révoquée quand le fichier change ou au démontage. Aucune URL pour un fichier qui
 * n'est pas une image (`type` en `image/…`).
 */
export function useObjectUrl(file: File | null | undefined): RefObject<HTMLImageElement | null> {
    const imgRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        const img = imgRef.current;
        if (!img || !file?.type.startsWith('image/')) return;
        const url = URL.createObjectURL(file);
        img.src = url;
        return () => URL.revokeObjectURL(url);
    }, [file]);

    return imgRef;
}
