module.exports = {
  schema: {
    networks: {
      // id: 'Network',
      // dao: { id: 'mongo', key: 'networks' },
      fields: {
        name: { type: String, required: true },
        placeholder: { type: ['network_placeholder'], by: 'network_id' },
      },
    },
    network_placeholder: {
      fields: {
        network_id: { type: 'networks', required: true },
        type: { type: String, required: true },
      },
    },
  },
  stores: {
    default: {
      type: 'mongo',
      uri: 'mongodb://localhost:27017/meteor',
    },
  },
};
