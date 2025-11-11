const Koa = require('koa');
const Router = require('@koa/router');
const { koaBody } = require('koa-body');
const koaLogger = require('koa-logger');
const { createLogger, format, transports } = require('winston');

const crypto = require('@wecom/crypto');
const { xml, record } = require('./utils');
require('dotenv').config();

const app = new Koa();
const router = new Router();
const { TOKEN, ENCODING_AES_KEY } = process.env;

const logger = createLogger({
    format: format.combine(
        format.timestamp(),
        format.splat(),
        format.simple()
    ),
    transports: [
        new transports.Console(),
        // new transports.File({ filename: 'app.log' }),
    ]
});

app.use(koaBody());
app.use(koaLogger());

logger.debug('Using token %s, aeskey %s', TOKEN, ENCODING_AES_KEY);

router.get('/scrm/callback', (ctx, next) => {
    // 保存时用GET请求校验
    const { echostr } = ctx.query;
    // 可以直接用解密代替验签+解密
    const { message } = crypto.decrypt(ENCODING_AES_KEY, echostr);
    // 返回 message 信息
    ctx.body = message;
});

router.post('/scrm/callback', async (ctx, next) => {
    const post_body = ctx.request.body;
    const { Encrypt, ToUserName, AgentID } = await xml(post_body);

    const { msg_signature, timestamp, nonce } = ctx.query;
    const signature = crypto.getSignature(TOKEN, timestamp, nonce, Encrypt);
    if (signature == msg_signature) {
        logger.info('signature matched!');
        logger.info('Received: %s', { Encrypt, ToUserName, AgentID });
        const { message } = crypto.decrypt(ENCODING_AES_KEY, Encrypt);
        const decrypted = await xml(message);
        record(decrypted);
        logger.info('decrypted', decrypted);

        switch (decrypted.InfoType) {
            case 'create_auth':
                logger.info(`create_auth, auth code = ${decrypted.AuthCode}`);
                break;
            case 'suite_ticket':
                logger.info(`suite_ticket, ticket = ${decrypted.SuiteTicket}`);
                break;
            case 'reset_permanent_code':
                logger.info(`reset_permanent_code, auth code = ${decrypted.AuthCode}`);
                break;
            case 'approve_special_auth':
            case 'cancel_special_auth':
                logger.info(`approve_special_auth, AuthType=${decrypted.AuthType}, AuthCorpId=${decrypted.AuthCorpId}`);
        }
        ctx.body = 'success';
    } else {
        logger.error('signature: %s !== msg_signature: %s', signature, msg_signature);
    }

});

app
    .use(router.routes())
    .use(router.allowedMethods());

app.listen(24601);
