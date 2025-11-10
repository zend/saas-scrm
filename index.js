const Koa = require('koa');
const Router = require('@koa/router');
const { koaBody } = require('koa-body');
const koaLogger = require('koa-logger');
const winston = require('winston');
const xml2js = require('xml2js');
const crypto = require('@wecom/crypto');

const app = new Koa();
const router = new Router();
const token = 'sTx1DXFszX1CVi9S01bv6MvOh';
const aeskey = 'gFpakt4dFMIEQFzyxFimLLs0w5c3g441BW7Bp9gGS2A';

const myFormat = winston.format.printf(({ level, message, label, timestamp }) => {
    return `${timestamp} [${label}] ${level}: ${message}`;
});
const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.label({ label: 'right meow!' }),
        winston.format.timestamp(),
        myFormat
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'app.log' })
    ]
});

app.use(koaBody());
app.use(koaLogger());

router.get('/scrm/callback', (ctx, next) => {
    logger.info('Get params', ctx.query);
    // 从 query 中获取相关参数
    const { msg_signature, timestamp, nonce, echostr } = ctx.query;
    const signature = crypto.getSignature(token, timestamp, nonce, echostr);

    if (signature === msg_signature) {
        console.info('签名验证成功')
        // 在应用详情页找到对应的EncodingAESKey
        // 如果签名校验正确，解密 message
        const { message } = crypto.decrypt(aeskey, echostr);
        console.log('message', message);
        // 返回 message 信息
        ctx.body = message;
    }
});

router.post('/scrm/callback', (ctx, next) => {
    const { msg_signature, timestamp, nonce, echostr } = ctx.query;
    const post_body = ctx.request.body;
    const signature = crypto.getSignature(token, timestamp, nonce, post_body);
    if (msg_signature == signature) {
        logger.info("Good signature.", signature);
        xml2js.parseString(post_body, (err, result) => {
            if (err) {
                logger.error('ERROR parsing xml: ', post_body);
                ctx.body = 'error';
                return;
            }
            const { message } = crypto.decrypt(aeskey, result.Encrypt);
            logger.info("Clear message: ", message);
            ctx.body = 'success';
        })
        
    } else {
        ctx.body = 'error';
    }
});

app
    .use(router.routes())
    .use(router.allowedMethods());

app.listen(24601);
