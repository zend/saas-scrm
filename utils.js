const xml2js = require('xml2js');

async function xml(xmlstr) {
    const result = await xml2js.parseStringPromise(xmlstr, { explicitArray: false });
    return result.xml;
}

module.exports = {
    xml
}