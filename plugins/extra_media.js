'use strict';
/**
 * 📁 FILE & MEDIA — command pack.
 * Handlers live in lib/extra/handlers/media.js
 */
const { createExtraPlugin } = require('../lib/extra/pluginFactory');
const { handlers } = require('../lib/extra/handlers/media');

module.exports = createExtraPlugin('extra_media', handlers);
