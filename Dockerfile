from alpine

RUN apk add npm
ADD . /corona-slack-bot
WORKDIR /corona-slack-bot
RUN npm install 
ENTRYPOINT ["npm", "start"]
