const express = require('express');
const schedule = require('node-schedule');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const nodeHtmlToImage = require('node-html-to-image');
const fs = require('fs');


const app = express();
const port = 3000;
const API_TOKEN = '6389376409:AAHupHdIUk9SHI17GZMOeJsClt9kZ3EvvgE';
const bot = new TelegramBot(API_TOKEN, { polling: true });

app.use(express.json());
app.post('/webhook', async (req, res) => {
  const webhook = req.body;
  console.log(webhook);
  return res.status(200).json();
});


Date.prototype.formatPln = function () {
  return `${this.getFullYear()}-${(this.getMonth() + 1).toString().padStart(2, '0')}-${this.getDate().toString().padStart(2, '0')}`;
};


Date.prototype.formatByn = function () {
  return `${this.getDate().toString().padStart(2, '0')}.${(this.getMonth() + 1).toString().padStart(2, '0')}.${this.getFullYear()}`;
};


const BYN_RATES = {};
const getBynRates = async () => {
  try {
    const endDate = new Date();
    const startDate = new Date();
    const bynRates = [];
    startDate.setMonth(startDate.getMonth() - 1);
    while (!((startDate.getMonth() === endDate.getMonth()) && (startDate.getDate() === endDate.getDate()))) {
      if (!BYN_RATES[startDate.formatByn()]) {
        await (new Promise((resolve) => setTimeout(resolve, 2000)));
        const { data: { rates } } = await axios.get(`https://developerhub.alfabank.by:8273/partner/1.0.1/public/nationalRates?date=${startDate.formatByn()}`);
        const rate = rates.find((rate) => (rate.iso === 'USD'));
        if (rate) {
          BYN_RATES[rate.date] = rate;
        }
      }
      if (BYN_RATES[startDate.formatByn()]) {
        bynRates.push(BYN_RATES[startDate.formatByn()]);
      }
      startDate.setDate(startDate.getDate() + 1);
    }
    return bynRates;
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    throw error;
  }
};

const getPlnUsdRates = async () => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 1);
  const { data: { rates } } = await axios.get(
    `http://api.nbp.pl/api/exchangerates/rates/c/usd/${startDate.formatPln()}/${endDate.formatPln()}?format=json`,
  );
  return rates;
};


const fetchExchangeRatesForLastMonth = async () => {
  try {
    const today = new Date();
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
    const formattedLastMonth = `${lastMonth.getFullYear()}-${lastMonth.getMonth() + 1}-${lastMonth.getDate()}`;
    const { data } = await axios.get(`https://www.nbrb.by/api/exrates/rates?ondate=${formattedLastMonth}&periodicity=0`);
    return data;
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    throw error;
  }
};

const getLineLength = (point1, point2) => {
  const leftLength = Math.abs(point2.marginLeft - point1.marginLeft);
  const topLength = Math.abs(point1.marginTop - point2.marginTop);
  return Math.sqrt((leftLength * leftLength) + (topLength * topLength));
};


const getDifference = (rates, fieldName, from, to) => {
  if (rates.length <= 0) {
    return null;
  }
  if (rates.length === 1) {
    return `1 ${from} - ${rates[0][fieldName]} ${to}`;
  }
  let diffBlock = '<div>';
  const prev = rates[rates.length - 2][fieldName];
  const current = rates[rates.length - 1][fieldName];
  let percent;
  if (current > prev) {
    percent = `, <span style="color: #C43525;">${((1 - (prev / current)) * 100).toFixed(4)}% ↓</span>`;
  } else if (current < prev) {
    percent = `, <span style="color: #00a200;">${((1 - (current / prev)) * 100).toFixed(4)}% ↑</span>`;
  } else {
    percent = '';
  }
  diffBlock += `<div>1 ${from} - ${rates[rates.length - 1][fieldName]} ${to}${percent}</div>`;
  diffBlock += '<div class="point-container">';
  let minimalMarginTop = rates[0][fieldName] * 2500;
  let maximalMarginTop = rates[0][fieldName] * 2500;
  let currentMarginLeft = 0;
  const points = rates.map((rate, i) => {
    const marginTop = rate[fieldName] * 2500;
    if (marginTop < minimalMarginTop) {
      minimalMarginTop = marginTop;
    }
    if (marginTop > maximalMarginTop) {
      maximalMarginTop = marginTop;
    }
    const obj = {
      rate: rate[fieldName],
      marginTop: marginTop,
      marginLeft: currentMarginLeft,
    };
    currentMarginLeft += 100;
    return obj;
  });
  minimalMarginTop -= 200;
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const prevPoint = points[i - 1];
    let backgroundColor;
    if (prevPoint) {
      if (point.rate <= prevPoint.rate) {
        backgroundColor = '#00a200';
      } else {
        backgroundColor = '#C43525';
      }
      const lineLength = getLineLength(prevPoint, point);
      const leftGrad = Math.abs(point.marginLeft - prevPoint.marginLeft) / lineLength;
      const topGrad = Math.abs(point.marginTop - prevPoint.marginTop) / lineLength;
      let currentMarginLeft = prevPoint.marginLeft + 17.5;
      let currentMarginTop = prevPoint.marginTop - minimalMarginTop + 17.5;
      for (let j = 0; j <= lineLength; j += 1) {
        diffBlock += `<div class="line-point" style="margin-left: ${currentMarginLeft}px; margin-top: ${currentMarginTop}px; background-color: ${backgroundColor};"></div>`;
        if (prevPoint.marginTop < point.marginTop) {
          currentMarginTop += topGrad;
        } else {
          currentMarginTop -= topGrad;
        }
        currentMarginLeft += leftGrad;
      }
    }
    diffBlock += `
<div
    class="point"
    style="margin-top: ${point.marginTop - minimalMarginTop}px; margin-left: ${point.marginLeft}px;${backgroundColor ? ` background-color: ${backgroundColor};` : ''} "
></div>
`;
  }
  diffBlock += '</div></div>';
  return diffBlock;
};

const diffToImage = async (diff, name) => nodeHtmlToImage({
  output: `./${name}.png`,
  html: `
<html>
<head>
<style>
.point-container {
display: flex;
position: relative;
}
.point {
position: absolute;
border-radius: 100px;
height: 35px;
width: 35px;
background-color: white;
z-index: 999;
}
.line-point {
position: absolute;
border-radius: 100px;
height: 5px;
width: 5px;
z-index: 9;
}
body {
display: flex;
padding-top: 100px;
justify-content: center;
width: 2480px;
height: 1000px;
background-color: #2B2B2B;
font-size: 150px;
color: #FEFEFE;
font-weight: bold;
}
</style>
</head>
<body>${diff}</body>
</html>
`,
});


const removeChannel = async (msg, match, isFromAdd) => {
  const groupId = msg.chat.id;
  if (fs.existsSync('groups.dat')) {
    const groups = JSON.parse(fs.readFileSync('groups.dat').toString()).filter((group) => (group !== groupId));
    fs.writeFileSync('groups.dat', JSON.stringify(groups));
  }
  if (!isFromAdd) {
    await bot.sendMessage(groupId, 'Unsubscribed');
  }
};

const addChannel = async (msg) => {
  await removeChannel(msg, null, true);
  const groupId = msg.chat.id;
  if (fs.existsSync('groups.dat')) {
    const groups = JSON.parse(fs.readFileSync('groups.dat').toString());
    groups.push(groupId);
    fs.writeFileSync('groups.dat', JSON.stringify(groups));
  } else {
    fs.writeFileSync('groups.dat', JSON.stringify([groupId]));
  }
  await bot.sendMessage(groupId, 'Subscribed');
};


const getChannels = () => {
  if (fs.existsSync('groups.dat')) {
    return JSON.parse(fs.readFileSync('groups.dat').toString());
  }
  return [];
};


const sendRatesData = async (msg) => {
  const plnRates = await getPlnUsdRates();
  const plnRateDifference = getDifference(plnRates, 'bid', 'USD', 'PLN');
  const bynRates = await getBynRates();
  const bynRateDifference = getDifference(bynRates, 'rate', 'USD', 'BYN');
  await diffToImage(plnRateDifference, 'plnusd');
  await diffToImage(bynRateDifference, 'bynusd');
  const groupIds = msg && msg.chat && msg.chat.id && [msg.chat.id] || getChannels();
  if (!groupIds.length) {
    return false;
  }
  for (const groupId of groupIds) {
    await bot.sendPhoto(groupId, 'plnusd.png');
    await bot.sendPhoto(groupId, 'bynusd.png');
  }
  return true;
};

app.listen(port, async () => {
  schedule.scheduleJob({ hour: 13, minute: 30 }, async () => {
    await sendRatesData();
  });
  bot.onText(/\/start/, addChannel);
  bot.onText(/\/stop/, removeChannel);
  bot.onText(/\/rate/, sendRatesData);
});
