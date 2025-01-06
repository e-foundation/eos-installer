FROM node:23-alpine AS builder
WORKDIR /app
COPY . .
RUN npm install && npm run build

FROM nginx:1.27.3

COPY --from=builder /app/dist /usr/share/nginx/html
