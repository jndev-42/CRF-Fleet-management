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

CMD ["npx", "tsx", "src/server.ts"]
