'use strict';
/**
 * 🎨 CREATIVE — command pack.
 * Handlers live in lib/extra/handlers/creative.js
 */
const { createExtraPlugin } = require('../lib/extra/pluginFactory');
const { handlers } = require('../lib/extra/handlers/creative');

module.exports = createExtraPlugin('extra_creative', handlers);
