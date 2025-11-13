import EventEmitter from 'events';
import { decrypt, getSignature } from '@wecom/crypto';
import { createLogger, format, transports } from 'winston';

import cache from "./cache.js";
import { httpPost, httpGet, xml } from './utils.js';

import 'dotenv/config';

const logger = createLogger({
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    transports: [
        new transports.Console(),
        new transports.File({ filename: 'log/wecom.log' }),
    ]
});

const TTL_SUITE_TICKET = 1200 // 实际有效期30分钟，每10分钟推送一次，缓存20分钟
const TTL_SUITE_ACCESS_TOKEN = 6000 // 实际有效期为7200，提前20分钟刷新
const TTL_AUTH_CODE = 600 // 10分钟有效
const TTL_PERMANENT_CODE = 9999999999 // 实际是永久有效
const TTL_ACCESS_TOKEN = 6000 // 实际有效期为7200，提前20分钟刷新

const { TOKEN, ENCODING_AES_KEY, SUITE_ID, SUITE_SECRET } = process.env;

const eventBus = new EventEmitter();

eventBus.on('gen_suite_access_token', gen_suite_access_token);
eventBus.on('gen_permanent_code', gen_permanent_code);
eventBus.on('gen_access_token', gen_access_token);

function check_signature(timestamp, nonce, encrypted_str, msg_signature) {
    const sig = getSignature(TOKEN, timestamp, nonce, encrypted_str);
    if (sig === msg_signature) {
        return true;
    } else {
        logger.error(`check_signature failed: ${sig} !== ${msg_signature}`);
        return false;
    }
}

function decrypt_text(encrypted_str) {
    return decrypt(ENCODING_AES_KEY, encrypted_str);
}

async function decrypt_post_body(post_body, corpid, timestamp, nonce, msg_signature) {
    const { Encrypt } = await xml(post_body);
    if (!check_signature(timestamp, nonce, Encrypt, msg_signature)) {
        return false;
    }
    const { message: xml_msg } = decrypt(ENCODING_AES_KEY, Encrypt);
    const message = await xml(xml_msg);
    switch (message.InfoType) {
        case 'suite_ticket':
            logger.info(`suite_ticket event, suiteid=${message.SuiteId}, ticket=${message.SuiteTicket}`);
            await set_suite_ticket(message.SuiteId, message.SuiteTicket);
            break;
        case 'create_auth':
            logger.info(`create_auth event, suiteid=${message.SuiteId}, authcode=${message.AuthCode}`);
            await set_auth_code(corpid, message.SuiteId, message.AuthCode);
            break;
        case 'reset_permanent_code':
            logger.info(`reset_permanent_code event, suiteid=${message.SuiteId}, auth code = ${message.AuthCode}`);
            await set_auth_code(corpid, message.SuiteId, message.AuthCode);
            break;
        case 'approve_special_auth':
        case 'cancel_special_auth':
            logger.info(`approve_special_auth event, AuthType=${message.AuthType}, AuthCorpId=${message.AuthCorpId}`);
            break;
        case 'change_auth':
            logger.info(`change_auth event, AuthCorpId=${message.AuthCorpId}`);
            break;

        default:
            // 其他消息不处理，返回给业务层
            return message;
    }
}

async function set_suite_ticket(suiteid, suite_ticket) {
    // suite_ticket 是模板维度的
    cache.set(`suite_ticket:${suiteid}`, suite_ticket, TTL_SUITE_TICKET);
    logger.info(`cache: [suite_ticket:${suiteid}]=[${suite_ticket}], ttl=${TTL_SUITE_TICKET}`);

    // 检查 Suite access token 有效性
    const suite_access_token = await get_suite_access_token(suiteid);
    if (!suite_access_token) {
        // 尝试生成新的 suite_access_token
        const json = JSON.stringify({ suiteid, suite_ticket });
        logger.info(`emit: gen_suite_access_token(${json})`);
        // await gen_suite_access_token(suiteid, suite_ticket);
        eventBus.emit('gen_suite_access_token', suiteid, suite_ticket);
    }
}

async function set_auth_code(corpid, suiteid, auth_code) {
    // corpid 要填写在回调URL中，这样推送auth_code时能关联到企业
    // auth code 是企业授权时推送，我们假设这个时候已经有 suite_ticket （每10分钟推送）
    // https://developer.work.weixin.qq.com/document/path/100965
    cache.set(`auth_code:${corpid}`, auth_code, TTL_AUTH_CODE);
    logger.info(`cache: [auth_code:${corpid}]=[${auth_code}], ttl=${TTL_AUTH_CODE}`);

    // 检查 permanent_code 的有效性
    const permanent_code = await get_permanent_code(corpid, suiteid);
    if (!permanent_code) {
        const suite_access_token = await get_suite_access_token(suiteid);
        // 尝试生成新的 permanent_code
        const json = JSON.stringify({ corpid, suiteid, auth_code, suite_access_token });
        logger.info(`emit: gen_permanent_code(${json})`,);
        // await gen_permanent_code(corpid, suiteid, auth_code, suite_access_token);
        eventBus.emit('gen_permanent_code', corpid, suiteid, auth_code, suite_access_token);
    }
}

async function gen_suite_access_token(suiteid, suite_ticket) {
    // suite_secret 需要配置在 .env 中，以免明文泄漏
    // https://developer.work.weixin.qq.com/document/path/97162
    const data = {
        suite_id: SUITE_ID,
        suite_secret: SUITE_SECRET,
        suite_ticket: suite_ticket
    };
    const { suite_access_token } = await httpPost('service/get_suite_token', data).catch(httpErrorHandler);
    logger.info(`cache: [suite_access_token:${suiteid}]=[${suite_access_token}], ttl=${TTL_SUITE_ACCESS_TOKEN}`);
    cache.set(`suite_access_token:${suiteid}`, suite_access_token, TTL_SUITE_ACCESS_TOKEN);
    return suite_access_token;
}

async function get_suite_access_token(suiteid) {
    return cache.get(`suite_access_token:${suiteid}`);
}

async function gen_permanent_code(corpid, suiteid, auth_code, suite_access_token) {
    // permanent_code 也是授权方应用的secret，可以用corpid + secret 换取代开发应用的 access token
    const data = {
        auth_code: auth_code,
    };
    const { permanent_code, auth_corp_info, auth_user_info } = await httpPost(
        `service/v2/get_permanent_code?suite_access_token=${suite_access_token}`,
        data
    ).catch(httpErrorHandler);
    logger.info(`cache: [permanent_code:${corpid}:${suiteid}]=[${permanent_code}], ttl=${TTL_PERMANENT_CODE}`);
    cache.set(`permanent_code:${corpid}:${suiteid}`, permanent_code, TTL_PERMANENT_CODE);

    logger.info(`cache: [auth_corp_info:${corpid}:${suiteid}]=[${auth_corp_info}], ttl=${TTL_PERMANENT_CODE}`);
    cache.set(`auth_corp_info:${corpid}:${suiteid}`, auth_corp_info, TTL_PERMANENT_CODE);

    logger.info(`cache: [auth_user_info:${corpid}:${suiteid}]=[${auth_user_info}], ttl=${TTL_PERMANENT_CODE}`);
    cache.set(`auth_user_info:${corpid}:${suiteid}`, auth_user_info, TTL_PERMANENT_CODE);

    // 自动生成代开发应用的 acccess token
    // await gen_access_token(corpid, permanent_code);
    eventBus.emit('gen_access_token', corpid, permanent_code);
}

async function get_permanent_code(corpid, suiteid) {
    return cache.get(`permanent_code:${corpid}:${suiteid}`);
}

async function gen_access_token(corpid, permanent_code) {
    // https://developer.work.weixin.qq.com/document/path/97164
    const api = `gettoken?corpid=${corpid}&corpsecret=${permanent_code}`
    const { access_token } = await httpGet(api).catch(httpErrorHandler);
    logger.info(`cache: [access_token:${corpid}]=[${access_token}], ttl=${TTL_ACCESS_TOKEN}`);
    cache.set(`access_token:${corpid}`, access_token, TTL_ACCESS_TOKEN);
    return access_token;
}

async function get_access_token(corpid) {
    return cache.get(`access_token:${corpid}`);
}

function httpErrorHandler(err) {
    logger.error(`Error: ${JSON.stringify(err)}`);
    return {};
}

export default {
    get_access_token,
    get_suite_access_token,
    get_permanent_code,
    check_signature,
    decrypt_text,
    decrypt_post_body
}
