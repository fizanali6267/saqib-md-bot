'use strict';
/**
 * 📱 SOCIAL MEDIA — command pack.
 * Handlers live in lib/extra/handlers/social.js
 */
const { createExtraPlugin } = require('../lib/extra/pluginFactory');
const { handlers } = require('../lib/extra/handlers/social');

module.exports = createExtraPlugin('extra_social', handlers);
