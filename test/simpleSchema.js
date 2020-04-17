module.exports = {
  typeDefs: `
    type Person @model {
      name: String!
      authored: [Book] @field(materializeBy: "author")
      emailAddress: String!
      status: String
    }

    type Book @model {
      name: String!
      price: Float!
      author: Person!
      bestSeller: Boolean
      bids: [Float]
    }
  `,
};
