const fetch = require("node-fetch");
const { WebClient } = require("@slack/web-api");

const Config = {
  CHANNEL: process.env.CHANNEL,
  BOT_NAME: process.env.BOT_NAME,
  SPAM_STRATEGY: process.env.SPAM_STRATEGY || "EDIT", // or "EDIT" to change last message
  SLACK_KEY: process.env.SLACK_KEY,
  NEW_LIMIT: process.env.NEW_LIMIT || 50,
  DELAY: process.env.DELAY || 60 // seconds
};

if (!Config.CHANNEL || !Config.BOT_NAME || !Config.SLACK_KEY) {
  console.error("Missing environment variables: CHANNEL, BOT_NAME, SLACK_KEY");
  process.exit(1);
}

const web = new WebClient(Config.SLACK_KEY);

const getCoronaStats = (function() {
  const cache = {
    data: {
      population: 0,
      infected: 0,
      newToday: 0,
      newYesterday: 0,
      dead: 0
    }
  };

  return async () => {
    try {
      const data = await getVgApiData();
      if (data.population) {
        cache.data = data;
        return data;
      } else {
        console.log("No data received", data);
      }
      return cache.data;
    } catch (e) {
      console.log("Error loading VG data. Using cache.", e);
      return cache.data;
    }
  };
})();

async function getVgApiData() {
  const resp = await fetch(
    "https://www.vg.no/spesial/2020/corona-viruset/data/norway-region-data/"
  );
  const data = await resp.json();

  const meta = data.metadata;
  return {
    population: meta.population,
    infected: meta.confirmed.total,
    newToday: meta.confirmed.newToday,
    newYesterday: meta.confirmed.newYesterday,
    dead: meta.dead.total
  };
}

const tick = (function() {
  let lastData = null;

  return async () => {
    const stats = await getCoronaStats();

    if (
      lastData &&
      lastData.infected === stats.infected &&
      lastData.dead === stats.dead
    ) {
      console.log("Nothing new ...");
      // nothing interesting new
      return;
    }

    if (lastData && stats.infected - lastData.infected < Config.NEW_LIMIT) {
      console.log("Not interesting enough yet ...");
      return;
    }

    lastData = stats;

    console.log("New data: ", stats);

    const per100k = 100_000 * (stats.infected / stats.population);

    const message = `*${stats.infected}* bekreftet smittet (${per100k.toFixed(
      1
    )} per 100k, ${stats.newToday} nye i dag, ${
      stats.newYesterday
    } i går), og *${stats.dead}* døde`;

    setLastSlackMessage(message);
  };
})();

async function setLastSlackMessage(message) {
  const history = await web.channels.history({
    count: 1,
    channel: Config.CHANNEL
  });

  const threadId =
    history.ok &&
    history.messages.length > 0 &&
    history.messages[0].bot_profile &&
    history.messages[0].bot_profile.name === Config.BOT_NAME
      ? history.messages[0].ts
      : null;

  if (threadId) {
    if (Config.SPAM_STRATEGY === "THREAD") {
      console.log("Adding thread message");
      await web.chat.postMessage({
        channel: Config.CHANNEL,
        text: message,
        thread_ts: threadId
      });
    } else {
      console.log("Editing last message");
      // "EDIT"
      await web.chat.update({
        channel: Config.CHANNEL,
        ts: threadId,
        text: message
      });
    }
  } else {
    console.log("Posting new message");
    await web.chat.postMessage({
      channel: Config.CHANNEL,
      text: message
    });
  }
}

const delay = Config.DELAY * 1000;

function loop() {
  tick();
  setTimeout(loop, delay);
}

loop();
