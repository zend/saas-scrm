const xml2js = require('xml2js');
const https = require('https');
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

async function httpPost(api, data) {
    const url = `https://qyapi.weixin.qq.com/cgi-bin/${api}`;
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(data);
        const req = https.request(url, {
            method: 'POST',
            headers: {
                'content-type': 'text/json',
                'content-length': Buffer.byteLength(postData),
            }
        }, (res) => {
            res.setEncoding('utf-8');
            let output = '';
            res.on('data', (chunk) => {
                output += chunk;
            });
            res.on('end', () => {
                resolve(output);
            });

        });
        req.on('error', (err) => {
            reject(err);
        });
        req.write(postData);
        req.end();
    });
}

function record(message) {
    logger.info(message);
}

module.exports = {
    xml,
    record,
    httpPost
}