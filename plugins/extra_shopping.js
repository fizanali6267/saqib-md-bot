'use strict';
/**
 * 🛒 E-COMMERCE — command pack.
 * Handlers live in lib/extra/handlers/shopping.js
 */
const { createExtraPlugin } = require('../lib/extra/pluginFactory');
const { handlers } = require('../lib/extra/handlers/shopping');

module.exports = createExtraPlugin('extra_shopping', handlers);
