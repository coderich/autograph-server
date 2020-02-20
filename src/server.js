const Server = require('./core/Server');
const schema = require('../test/simpleSchema');
const stores = require('../test/stores');

const server = new Server(schema, stores);
server.start();
