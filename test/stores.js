module.exports = {
  default: {
    type: 'mongo',
    uri: 'mongodb://localhost/autograph',
  },
  neo4jRest: {
    type: 'neo4jRest',
    uri: 'http://localhost:7474',
  },
  neo4jDriver: {
    type: 'neo4jDriver',
    uri: 'bolt://localhost',
  },
};
