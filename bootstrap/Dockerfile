FROM node:22-bookworm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY . /app

WORKDIR /app
RUN pnpm install --frozen-lockfile

CMD ["node", "./dist/cli.js"]
