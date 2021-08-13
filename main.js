const Binance = require('node-binance-api');
var clear = require('clear');

const binance = new Binance().options({
    APIKEY: '',
    APISECRET: '',
    recvWindow: 60000
});
// binance.candlesticks("BTCUSDT", "1m", (error, ticks, symbol) => {
//     let last_tick = ticks[ticks.length - 1];
//     let [time, open, high, low, close, volume, closeTime, assetVolume, trades, buyBaseVolume, buyAssetVolume, ignored] = last_tick;
//     console.log(close)
// }, {
//     limit: 500,
//     startTime: 1618871012421 - 60000,
//     endTime: 1618871012421 + 60000
// });

const filterObject = (obj, callback) => {
    return Object.fromEntries(Object.entries(obj).filter(([key, val]) => callback(val, key)));
}
const sorter = (obj, callback) => Object.fromEntries(
    Object.entries(obj).sort(([, a], [, b]) => callback(a, b))
);
const mainCoins = ["USDT", "BTC", "BNB", "ETH"]
var newBalances = {};
var prices = {};
var tradeHistory = []
var priceTime = {}

const priceCalculator = (key, quantity) => {
    if (prices[key + 'USDT']) {
        return (parseFloat(prices[key + 'USDT']) * parseFloat(quantity))
    }
    if (prices[key + 'BTC'] && prices['BTCUSDT']) {
        return (parseFloat(prices[key + 'BTC']) * parseFloat(prices['BTCUSDT']) * parseFloat(quantity))
    }
    if (prices[key + 'BNB'] && prices['BNBUSDT']) {
        return (parseFloat(prices[key + 'BNB']) * parseFloat(prices['BNBUSDT']) * parseFloat(quantity))
    }
    if (prices[key + 'ETH'] && prices['ETHUSDT']) {
        return (parseFloat(prices[key + 'ETH']) * parseFloat(prices['ETHUSDT']) * parseFloat(quantity))
    }
    if (key === 'USDT') {
        return parseFloat(quantity)
    }
}
binance.balance(async (error, balances) => {
    if (error) return console.error(error);
    Object.keys(balances).forEach(key => {
        balances[key].total = (parseFloat(balances[key].onOrder) + parseFloat(balances[key].available)).toFixed(8)
    })
    newBalances = filterObject(balances, (val) => (parseFloat(val.available) + parseInt(val.onOrder)) !== 0)
    Object.keys(newBalances).forEach(key => {
        mainCoins.forEach(coin => {
            binance.trades(key + coin, (error, trades, symbol) => {
                if (!error) {
                    tradeHistory = [...tradeHistory, ...Object.values(trades)]
                } else {

                }
            });
        })
    })
});
binance.websockets.prevDay(false, (error, response) => {
    prices[response.symbol] = response.close
});


setInterval(() => {
    clear()
    Object.keys(newBalances).forEach(async key => {
        price = priceCalculator(key, newBalances[key].total)
        newBalances[key].price = price && price.toFixed(8)
        ///////
        const thisCoinHistory = tradeHistory.filter(history => history.symbol === key + "USDT" || history.symbol === key + 'BTC' || history.symbol === key + 'BNB' || history.symbol === key + 'ETH')
        thisCoinHistory.sort((a, b) => b.time - a.time)
        var quantity = parseFloat(newBalances[key].total)
        var oldPrice = 0

        if (thisCoinHistory[0] && newBalances[key].price) {
            while (priceCalculator(key, quantity) >= 2) {
                if (thisCoinHistory[0]) {
                    if (thisCoinHistory[0].symbol.slice(-4) !== "USDT") {
                        if (priceTime[thisCoinHistory[0].time]) {
                            thisCoinHistory[0].price = (parseFloat(priceTime[thisCoinHistory[0].time]) * parseFloat(thisCoinHistory[0].price)).toFixed(8)

                        } else {
                            const ticks = await binance.candlesticks(thisCoinHistory[0].symbol.slice(-3) + "USDT", "1m", false, {
                                limit: 500,
                                startTime: thisCoinHistory[0].time - 60000,
                                endTime: thisCoinHistory[0].time + 60000
                            });
                            var last_tick = ticks[ticks.length - 1];
                            var [time, open, high, low, close, volume, closeTime, assetVolume, trades, buyBaseVolume, buyAssetVolume, ignored] = last_tick;
                            priceTime[thisCoinHistory[0].time] = parseFloat(close).toFixed(8)
                            thisCoinHistory[0].price = (parseFloat(close) * parseFloat(thisCoinHistory[0].price)).toFixed(8)
                        }
                        thisCoinHistory[0].symbol = thisCoinHistory[0].symbol.slice(0, -3) + "USDT"
                    }
                    if (thisCoinHistory[0].isBuyer) {
                        quantity -= parseFloat(thisCoinHistory[0].qty)
                        oldPrice += (parseFloat(thisCoinHistory[0].qty) * parseFloat(thisCoinHistory[0].price))

                    } else {
                        quantity += parseFloat(thisCoinHistory[0].qty)
                        oldPrice -= (parseFloat(thisCoinHistory[0].qty) * parseFloat(thisCoinHistory[0].price))
                    }
                    if (quantity < 0 && (-priceCalculator(key, quantity) >= 2)) {
                        oldPrice -= (-parseFloat(quantity) * parseFloat(thisCoinHistory[0].price))
                    }
                    thisCoinHistory.shift()

                }
            }

        }
        newBalances[key].profit = (((priceCalculator(key, newBalances[key].total) / oldPrice) - 1) * 100).toFixed(2)

    })
    const totalAssets = Object.values(newBalances).reduce((accumulator, currentValue) => {
        if (currentValue.price) {
            return accumulator + parseFloat(currentValue.price)
        } else {
            return accumulator
        }
    }, 0).toFixed(2)
    console.table(sorter(filterObject(newBalances, (val) => (val.price >= 1 || !val.price)), (a, b) => parseFloat(b.price) - parseFloat(a.price)))
    console.log("Total Assets:", totalAssets, "USDT", "  ", (totalAssets / 1.19).toFixed(2), "EUR")
}, 1000)
