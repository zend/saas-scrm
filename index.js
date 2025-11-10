const Koa = require('koa');
const Router = require('@koa/router');
const { koaBody } = require('koa-body');
const koaLogger = require('koa-logger');
const { createLogger, format, transports } = require('winston');
const xml2js = require('xml2js');
const crypto = require('@wecom/crypto');
require('dotenv').config();

const app = new Koa();
const router = new Router();
const { token, aeskey } = process.env;

const logger = createLogger({
    format: format.combine(
        format.timestamp(),
        format.splat(),
        format.simple()
    ),
    transports: [
        new transports.Console(),
        new transports.File({ filename: 'app.log' }),
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
        logger.info('签名验证成功')
        // 在应用详情页找到对应的EncodingAESKey
        // 如果签名校验正确，解密 message
        const { message } = crypto.decrypt(aeskey, echostr);
        logger.log('message', message);
        // 返回 message 信息
        ctx.body = message;
    }
});

router.post('/scrm/callback', (ctx, next) => {
    const { msg_signature, timestamp, nonce } = ctx.query;
    const post_body = ctx.request.body;
    console.log(post_body);
    const signature = crypto.getSignature(token, timestamp, nonce, post_body);
    logger.info('signature: %s, msg_signature: %s', signature, msg_signature);
    logger.info('post_body: %s', post_body);
    if (msg_signature == signature) {
        logger.info("Good signature.", signature);
        xml2js.parseString(post_body, (err, result) => {
            if (err) {
                logger.error('ERROR parsing xml: ', post_body);
                ctx.body = '';
                return;
            }
            const { message } = crypto.decrypt(aeskey, result.Encrypt);
            logger.info("Clear message: ", message);
            ctx.body = '';
        });
    } else {
        logger.error('signature not match: %s !== %s', signature, msg_signature);
        ctx.body = '';
    }
});

app
    .use(router.routes())
    .use(router.allowedMethods());

app.listen(24601);
