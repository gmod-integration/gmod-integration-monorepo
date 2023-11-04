function gmLog(type, message) {
    // [YYYY-MM-DD HH:mm:ss] [UPERCASE_ID] message
    console.log('[' + new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '') + '] [' + type.toUpperCase() + '] ' + message);
}

module.exports = {
    gmLog
};