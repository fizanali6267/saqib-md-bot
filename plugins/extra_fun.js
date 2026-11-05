'use strict';
/**
 * 🎉 TRIVIA & FUN — command pack.
 * Handlers live in lib/extra/handlers/fun_extra.js
 */
const { createExtraPlugin } = require('../lib/extra/pluginFactory');
const { handlers } = require('../lib/extra/handlers/fun_extra');

module.exports = createExtraPlugin('extra_fun', handlers);
