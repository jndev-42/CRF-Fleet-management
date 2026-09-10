#!/bin/sh
# Xvfb **uniquement** quand on le demande.
#
# `xvfb-run` enveloppait auparavant le démarrage dans tous les cas : le serveur
# devenait alors tributaire d'un affichage virtuel dont il n'a besoin qu'en mode
# headful, et un Xvfb qui coince empêchait le port de s'ouvrir — Render signalant
# « No open ports detected » sans que rien n'indique la cause.
#
# Le chemin par défaut ne dépend plus de Xvfb du tout.
set -e

if [ "$HEADED" = "1" ]; then
    echo "[entrypoint] mode headful — démarrage sous Xvfb"
    exec xvfb-run -a ./node_modules/.bin/tsx src/server.ts
fi

echo "[entrypoint] mode headless"
exec ./node_modules/.bin/tsx src/server.ts
