import Koa from 'koa';
import Router from '@koa/router';
import { koaBody } from 'koa-body';
import { createLogger, format, transports } from 'winston';

import { httpPost, httpGet } from './utils.js';
import cache from "./cache.js";
import wecom from './wecom.js';

const app = new Koa();
const router = new Router();

const logger = createLogger({
    format: format.combine(
        format.timestamp(),
        format.simple()
    ),
    transports: [
        new transports.Console(),
        new transports.File({ filename: 'log/app.log' }),
    ]
});

app.use(koaBody());

router.get('/scrm/callback', (ctx) => {
    // 保存时用GET请求校验
    logger.info(`router.get: ${ctx.url}`);
    const { timestamp, nonce, echostr, msg_signature } = ctx.query || {};
    if (wecom.check_signature(timestamp, nonce, echostr, msg_signature)) {
        const { message } = wecom.decrypt_text(echostr);
        ctx.body = message;
    } else {
        ctx.body = 'sig_error';
    }
});

router.post('/scrm/callback', async (ctx) => {
    logger.info(`router.post: ${ctx.url}, data=${ctx.request.body}`);
    const post_body = ctx.request.body || '';
    const { corpid, timestamp, nonce, msg_signature } = ctx.query || {};
    const message = await wecom.decrypt_post_body(post_body, corpid, timestamp, nonce, msg_signature);
    
    logger.info(`Received event message: ${message}`);
    ctx.body = 'success';
});

router.get('/scrm/api/department/list', async (ctx) => {
    const { corpid } = ctx.query || {};
    const access_token = await wecom.get_access_token(corpid);
    const api = `department/simplelist?access_token=${access_token}&id=0`;
    const output = await httpGet(api);
    logger.info(`output ${output}`);
    ctx.body = output;
});

router.get('/scrm/api/user/list', async (ctx) => {
    const { corpid } = ctx.query || {};
    const access_token = await wecom.get_access_token(corpid);
    const api = `user/list_id?access_token=${access_token}&cursor=0&limit=100`;
    const output = await httpGet(api);
    logger.info(`output ${output}`);
    ctx.body = output;
});

router.get('/scrm/test/peek_cache', async (ctx) => {
    const all_cache = await cache.all();
    ctx.body = JSON.stringify(all_cache);
});

app
    .use(router.routes())
    .use(router.allowedMethods());

const PORT = 24601;
logger.info(`Server started at ${PORT}`);
app.listen(PORT);
