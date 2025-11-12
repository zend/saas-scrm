import { parseStringPromise } from 'xml2js';
import { request } from 'https';
import { createLogger, format, transports } from 'winston';

const logger = createLogger({
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    transports: [
        new transports.Console(),
        new transports.File({ filename: 'traffic.log' }),
    ]
});

async function xml(xmlstr) {
    const result = await parseStringPromise(xmlstr, { explicitArray: false });
    return result.xml;
}

async function httpGet(api) {
    // const url = `https://qyapi.weixin.qq.com/cgi-bin/${api}`;
    const url = `https://tx.ttz.ac.cn:24603/cgi-bin/${api}`;
    return new Promise((resolve, reject) => {
        const req = request(url, (res) => {
            const { statusCode } = res;
            if (statusCode !== 200) {
                logger.error(`http error code ${statusCode}, url ${url}`);
                return;
            }
            res.setEncoding('utf-8');
            let output = '';
            res.on('data', (chunk) => {
                output += chunk;
            });
            res.on('end', () => {
                logger.info(`httpGet(${url})=${output}`);
                const data = JSON.parse(output);
                if (data.errcode || data.errmsg) {
                    logger.error(`HTTP Error!!! errcode=${data.errcode}, errmsg=${data.errmsg}`);
                    reject(data);
                } else {
                    resolve(data);
                }
            });

        });
        req.on('error', (err) => {
            reject(err);
        });
        req.end();
    });
}

async function httpPost(api, data) {
    // const url = `https://qyapi.weixin.qq.com/cgi-bin/${api}`;
    const url = `https://tx.ttz.ac.cn:24603/cgi-bin/${api}`;
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(data);
        const req = request(url, {
            method: 'POST',
            headers: {
                'content-type': 'text/json',
                'content-length': Buffer.byteLength(postData),
            }
        }, (res) => {
            const { statusCode } = res;
            if (statusCode !== 200) {
                logger.error(`http error code ${statusCode}, url ${url}, postData ${postData}`);
                return;
            }
            res.setEncoding('utf-8');
            let output = '';
            res.on('data', (chunk) => {
                output += chunk;
            });
            res.on('end', () => {
                logger.info(`httpPost(${url}, ${postData})=${output}`);
                const data = JSON.parse(output);
                if (data.errcode || data.errmsg) {
                    logger.error(`HTTP Error!!! errcode=${data.errcode}, errmsg=${data.errmsg}`);
                    reject(data);
                } else {
                    resolve(data);
                }
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

export {
    xml,
    record,
    httpPost,
    httpGet
}