# 多阶段构建：node 构建静态资源 -> nginx 提供生产服务
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
# 用国内 npm 镜像源加速（国内服务器直连 npm registry 易卡）
RUN npm config set registry https://registry.npmmirror.com && npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
