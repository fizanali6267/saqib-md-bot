'use strict';
/**
 * 🎮 GAMING — command pack.
 * Handlers live in lib/extra/handlers/games.js
 */
const { createExtraPlugin } = require('../lib/extra/pluginFactory');
const { handlers } = require('../lib/extra/handlers/games');

module.exports = createExtraPlugin('extra_games', handlers);
