FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY crawlers/ ./crawlers/
COPY tsconfig.json ./

ENV NODE_ENV=production

# Default crawler if none specified
ARG CRAWLER_NAME=unnamed-crawler
ENV CRAWLER_NAME=${CRAWLER_NAME}

CMD npm run start:subcrawler --crawler=${CRAWLER_NAME}
