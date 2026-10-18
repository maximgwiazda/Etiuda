"use strict";
/* The relay half and the program half are product.cjs. The relay is the worker. The program is
   shell/relay/channel.cjs over shell/relay/blob.cjs. acceptDeskFile is that channel's own receipt.
   This adapter does not load model.cjs, so a desk-file pass here is the channel's and not the model's. */
module.exports = require("./product.cjs");
