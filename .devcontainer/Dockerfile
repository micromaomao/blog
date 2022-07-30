FROM node
RUN apt update && apt install librsvg2-bin
RUN npm i -g svgo
USER node:node
ENV HOME=/home/node
ENTRYPOINT [ "sleep", "100d" ]
