FROM node:22-bookworm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY . /app
COPY ./bootstrap/package.json /app/package.json

WORKDIR /app
RUN npm install

CMD ["node", "./dist/cli.js"]
