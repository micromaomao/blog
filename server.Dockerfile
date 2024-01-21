FROM node:lts
WORKDIR /usr/src/app
COPY . .
RUN npm ci
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "run", "start:server"]
