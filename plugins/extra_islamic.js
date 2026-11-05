'use strict';
/**
 * 🕌 ISLAMIC — command pack.
 * Handlers live in lib/extra/handlers/islamic.js
 */
const { createExtraPlugin } = require('../lib/extra/pluginFactory');
const { handlers } = require('../lib/extra/handlers/islamic');

module.exports = createExtraPlugin('extra_islamic', handlers);
