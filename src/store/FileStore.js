const fs = require('fs');
const { promisfy } = require('util');

const open = promisfy(fs.open);

module.exports = class FileStore {
  constructor(uri) {
    this.uri = uri;
  }
};
