const xml2js = require('xml2js');
const { createLogger, format, transports } = require('winston');

const logger = createLogger({
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    transports: [
        new transports.File({ filename: 'traffic.log' }),
    ]
});

async function xml(xmlstr) {
    const result = await xml2js.parseStringPromise(xmlstr, { explicitArray: false });
    return result.xml;
}

function record(message) {
    logger.info(message);
}

module.exports = {
    xml,
    record
}