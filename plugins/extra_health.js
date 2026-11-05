'use strict';
/**
 * 💚 HEALTH — command pack.
 * Handlers live in lib/extra/handlers/health.js
 */
const { createExtraPlugin } = require('../lib/extra/pluginFactory');
const { handlers } = require('../lib/extra/handlers/health');

module.exports = createExtraPlugin('extra_health', handlers);
