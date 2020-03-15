from alpine

RUN apk add npm
#RUN apk add jq
ADD . /corona-slack-bot
WORKDIR /corona-slack-bot
RUN npm install 
ENTRYPOINT ["npm", "start"]
