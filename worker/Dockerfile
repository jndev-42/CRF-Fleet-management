# Image officielle Playwright : Chromium et ses dépendances système sont déjà
# présents. Les installer soi-même sur une base Node exigerait `apt` en root, ce
# que l'environnement natif de Render n'autorise pas — d'où Docker.
#
# La version de l'image et celle du paquet npm doivent rester identiques :
# Playwright refuse de démarrer un navigateur d'une autre version que la sienne.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app

COPY package.json package-lock.json* ./
# `--omit=dev` : ni typescript ni @types ne servent à l'exécution (tsx transpile
# à la volée). Sur le plan gratuit de Render, chaque Mo d'image compte.
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

# `xvfb-run` fournit un affichage virtuel, ce qui permet de lancer Chromium en
# mode **headful** dans le conteneur en posant `HEADED=1`. Sans variable, le
# navigateur reste headless et `xvfb-run` ne coûte qu'un processus dormant.
#
# Le levier existe parce que Gigya applique un contrôle anti-robot au risque, et
# qu'un Chromium headless est trivialement détectable. `HEADED=1` est la première
# chose à essayer si l'authentification échoue depuis le serveur alors qu'elle
# passe en local.
CMD ["xvfb-run", "-a", "npx", "tsx", "src/server.ts"]
