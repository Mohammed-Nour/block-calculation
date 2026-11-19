FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS build
WORKDIR /build/frontend
ARG VITE_BASE_PATH=/
ENV HUSKY=0 CI=true VITE_API_MODE=http VITE_API_BASE_URL="" VITE_BASE_PATH=${VITE_BASE_PATH}
RUN npm install --global --ignore-scripts pnpm@10.34.5
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpm-built-dependencies.json ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx.auth-off.conf /etc/nginx/blockcalc-auth.conf
COPY --from=build /build/frontend/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1
