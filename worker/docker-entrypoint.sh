#!/bin/sh
# Démarrage du worker. **Le port s'ouvre quoi qu'il arrive.**
#
# `xvfb-run` a été essayé et échoue silencieusement dans cette image : le serveur
# ne démarrait pas du tout en `HEADED=1`, et Render signalait « No open ports
# detected » sans rien qui désigne la cause. La leçon retenue est moins « réparer
# xvfb-run » que « ne jamais faire dépendre l'ouverture du port d'un composant
# accessoire ».
#
# Xvfb est donc lancé **à côté**, en tâche de fond et de façon non fatale. S'il
# ne monte pas, le service répond quand même : seul le mode headful devient
# indisponible, et l'échec se manifeste alors comme une erreur transitoire de
# requête — jamais comme un service mort.

if [ "$HEADED" = "1" ]; then
    if command -v Xvfb > /dev/null 2>&1; then
        Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp > /tmp/xvfb.log 2>&1 &
        export DISPLAY=:99

        # Attente bornée du socket X. Jamais bloquante : au pire on démarre sans.
        i=0
        while [ "$i" -lt 20 ]; do
            [ -e /tmp/.X11-unix/X99 ] && break
            i=$((i + 1))
            sleep 0.25
        done

        if [ -e /tmp/.X11-unix/X99 ]; then
            echo "[entrypoint] Xvfb prêt sur DISPLAY=:99 — mode headful"
        else
            echo "[entrypoint] ⚠️ Xvfb n'a pas démarré en 5 s — le service répond, mais le mode headful échouera."
            cat /tmp/xvfb.log 2>/dev/null | head -5
        fi
    else
        echo "[entrypoint] ⚠️ HEADED=1 mais Xvfb est absent de l'image — le mode headful échouera."
    fi
else
    echo "[entrypoint] mode headless"
fi

# `tsx` par son chemin dans `node_modules/.bin`, jamais par `npx` : celui-ci
# interroge le registre quand il ne résout pas immédiatement le binaire.
exec ./node_modules/.bin/tsx src/server.ts
