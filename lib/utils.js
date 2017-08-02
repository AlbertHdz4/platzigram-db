'use strict'
const crypto = require('crypto')

const utils = {
  // Es lo mismo extractTags: extractTags si el atributo
  // se llama de la misma manera que la propiedad se puede
  // omitir y solo colocar el nombre de la misma
  extractTags,
  encrypt,
  normalize
}

function extractTags (text) {
  if (text == null) return []
  // Aqui utilizamos la funcionalidad match que es
  // una funcion de la clase String o prototype de
  // String que nos permite hacer match de una expresion
  // regular, definimos de igual manera que en regexr
  // y g nos indica que es una regla o expresion global
  let matches = text.match(/#(\w+)/g)
  if (matches == null) return []
  matches = matches.map((word) => normalize(word))
  console.log(matches)
  return matches
}

// Funcion que normaliza los textos para que se comparen
// en los test
function normalize (text) {
  // Primero se convierten a minusculas
  text = text.toLowerCase()
  // Despues se remplazan los # por espacios o
  // elementos vacios
  text = text.replace(/#/g, '')
  return text
}

function encrypt (password) {
  let shasum = crypto.createHash('sha256')
  // Esto nos genera un texto binario
  shasum.update(password)
  // Cambiamos el password a formato hexadecimal
  return shasum.digest('hex')
}

module.exports = utils
