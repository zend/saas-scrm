const Koa = require('koa');
const Router = require('@koa/router');
const { koaBody } = require('koa-body');
const koaLogger = require('koa-logger');
const { createLogger, format, transports } = require('winston');

const crypto = require('@wecom/crypto');
const { xml } = require('./utils');
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
        new transports.File({ filename: 'app.log' }),
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
    logger.info('Received: %s', { Encrypt, ToUserName, AgentID });
    const { xml_message } = crypto.decrypt(ENCODING_AES_KEY, Encrypt);
    logger.info('xml message: %s', xml_message);
    const decrypted = await xml(xml_message);
    logger.info('decrypted', decrypted);
    ctx.body = 'success';
});

app
    .use(router.routes())
    .use(router.allowedMethods());

app.listen(24601);
