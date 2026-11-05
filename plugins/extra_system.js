'use strict';
/**
 * 🖥️ SYSTEM & SERVER — command pack.
 * Handlers live in lib/extra/handlers/system.js
 */
const { createExtraPlugin } = require('../lib/extra/pluginFactory');
const { handlers } = require('../lib/extra/handlers/system');

module.exports = createExtraPlugin('extra_system', handlers);
