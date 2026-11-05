'use strict';
/**
 * 🤖 AI & AUTOMATION — command pack.
 * Handlers live in lib/extra/handlers/ai.js
 */
const { createExtraPlugin } = require('../lib/extra/pluginFactory');
const { handlers } = require('../lib/extra/handlers/ai');

module.exports = createExtraPlugin('extra_ai', handlers);
