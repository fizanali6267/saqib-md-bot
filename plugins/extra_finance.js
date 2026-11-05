'use strict';
/**
 * 💰 FINANCE & CRYPTO — command pack.
 * Handlers live in lib/extra/handlers/finance.js
 */
const { createExtraPlugin } = require('../lib/extra/pluginFactory');
const { handlers } = require('../lib/extra/handlers/finance');

module.exports = createExtraPlugin('extra_finance', handlers);
