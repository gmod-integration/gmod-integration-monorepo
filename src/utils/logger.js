function gmLog(type, message) {
    console.log('[' + new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '') + '] [' + type + '] ' + message);
}

module.exports = {
    gmLog
};