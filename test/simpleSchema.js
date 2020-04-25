module.exports = {
  typeDefs: `
    type Person @model(driver: "neo4jDriver") {
      name: String!
      authored: [Book] @field(materializeBy: "author")
      emailAddress: String!
      status: String
    }

    type Book @model(driver: "neo4jDriver") {
      name: String!
      price: Float!
      author: Person! @field(enforce: immutable)
      bestSeller: Boolean
      bids: [Float]
    }
  `,
};
