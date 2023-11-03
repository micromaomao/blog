FROM node:lts
RUN apt update -y && apt install librsvg2-bin -y
RUN npm i -g svgo nodemon
USER node:node
ENV HOME=/home/node
ENTRYPOINT [ "/bin/bash", "-c" ]
CMD [ "sleep", "100d" ]
