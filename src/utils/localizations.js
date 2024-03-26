const fs = require('fs');
const path = require('path');

function insertOptions(str, options) {
    if (!options) return str;

    for (let i = 0; i < options.length; i++) {
        str = str.replace(`{${i + 1}}`, options[i]);
    }

    return str;
}

function getDefaultTrad(key, options) {
    try {
        const defaultLanguage = require('../locales/en.json');

        if (key in defaultLanguage) {
            return insertOptions(defaultLanguage[key], options);
        } else {
            console.error(`Missing key ${key} in default language` + (options ? ` with the options ${options.join(', ')}` : ''));
            return key;
        }
    } catch (error) {
        console.error(`Error in getDefaultTrad: ${error.message}`);
        return key;
    }
}

function getTranslate(key, language, options) {
    try {
        language = language ? language.substring(0, 2) : 'en';
        const filePath = path.join(__dirname, `../locales/${language}.json`);

        if (!fs.existsSync(filePath)) {
            language = 'en';
        }

        const translate = require(`../locales/${language}.json`);
        if (key in translate) {
            return insertOptions(translate[key], options);
        } else {
            return getDefaultTrad(key, options);
        }
    } catch (error) {
        console.error(`Error in getTranslate: ${error.message}`);
        return getDefaultTrad(key, options);
    }
}

module.exports = {
    getTranslate
};