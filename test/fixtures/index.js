// En este documento tendremos algunos datos de prueba
// para poder realizar los tests con datos aleatorios, se simula que
// tenemos varias imagenes en la base de datos
'use strict'
const uuid = require('uuid-base62')

const fixtures = {
  // getImage: function getImage () {
  //   return {
  //
  //   }
  // }
  getImage () {
    return {
      description: 'an #awesome picture with #tags #platzi',
      url: `https://platzigram.test/${uuid.v4()}.jpg`,
      likes: 0,
      liked: false,
      userId: uuid.uuid()
    }
  },
  getImages (n) {
    let images = []
    while (n-- > 0) {
      images.push(this.getImage())
    }
    return images
  },
  getUser () {
    return {
      name: 'A random user',
      username: `user_${uuid.v4()}`,
      password: uuid.uuid(),
      email: `${uuid.v4()}@platzi.test`
    }
  }
}

module.exports = fixtures
