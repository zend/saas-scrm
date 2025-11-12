import Koa from 'koa';
import Router from '@koa/router';
import { koaBody } from 'koa-body';
import koaLogger from 'koa-logger';
import { createLogger, format, transports } from 'winston';

import { httpPost, httpGet } from './utils.js';
import cache from "./cache.js";
import wecom from './wecom.js';

import 'dotenv/config';

const app = new Koa();
const router = new Router();

const logger = createLogger({
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    transports: [
        new transports.Console(),
        // new transports.File({ filename: 'app.log' }),
    ]
});

app.use(koaBody());
app.use(koaLogger());

router.get('/scrm/callback', (ctx) => {
    // 保存时用GET请求校验
    const { timestamp, nonce, echostr, msg_signature } = ctx.query || {};
    if (wecom.check_signature(timestamp, nonce, echostr, msg_signature)) {
        ctx.body = wecom.decrypt_text(echostr);
    } else {
        ctx.body = 'sig_error';
    }
});

router.post('/scrm/callback', async (ctx) => {
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
    const all_cache = cache.all();
    ctx.body = JSON.stringify(all_cache);
});

app
    .use(router.routes())
    .use(router.allowedMethods());

const PORT = 24601;
logger.info(`Server started at ${PORT}`);
app.listen(PORT);
