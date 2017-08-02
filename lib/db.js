'use strict'

const co = require('co')
const r = require('rethinkdb')
const utils = require('./utils')
const uuid = require('uuid-base62')
const Promise = require('bluebird')

const defaults = {
  host: 'localhost',
  port: 28015,
  db: 'platzigram'
}

class Db {
  constructor (options) {
    options = options || {}
    this.host = options.host || defaults.host
    this.port = options.port || defaults.port
    this.db = options.db || defaults.db
    this.setup = options.setup || false
  }

  connect (callback) {
    this.connection = r.connect({
      host: this.host,
      port: this.port
    })

    // Se necesita saber que ya esta conectado
    this.connected = true
    let connection = this.connection
    let db = this.db
    if (!this.setup) {
      return Promise.resolve(connection).asCallback(callback)
    }
    let setup = co.wrap(function * () {
      // conn es una referencia a la conexion de la base de datos
      let conn = yield connection
      let dbList = yield r.dbList().run(conn)
      if (dbList.indexOf(db) === -1) {
        yield r.dbCreate(db).run(conn)
      }

      let dbTables = yield r.db(db).tableList().run(conn)
      if (dbTables.indexOf('images') === -1) {
        yield r.db(db).tableCreate('images').run(conn)
        // Podemos crear indices para que las queries y busquedas
        // sean aun mas eficientes cuando queremos acceder a la base
        // de datos
        yield r.db(db).table('images').indexCreate('createdAt').run(conn)
        // Esta tabla va a poder permitir multiples registros con el mismo indice
        // para ello le pasamos la propiedad multi: true de esa manera definimos
        // que el indice userId puede estar repetido multiples veces en la tabla de
        // imagenes
        yield r.db(db).table('images').indexCreate('userId', {
          multi: true
        }).run(conn)
      }

      if (dbTables.indexOf('users') === -1) {
        yield r.db(db).tableCreate('users').run(conn)
        yield r.db(db).table('users').indexCreate('username').run(conn)
      }
      return conn
    })
    return Promise.resolve(setup()).asCallback(callback)
  }

  disconnect (callback) {
    if (!this.connected) {
      return Promise.reject(new Error('It is already disconnnected')).asCallback(callback)
    }

    this.connected = false
    return Promise.resolve(this.connection).then((conn) => conn.close())
  }

  saveImage (image, callback) {
    if (!this.connected) {
      return Promise.reject(new Error('It is already disconnnected')).asCallback(callback)
    }

    let connection = this.connection
    let db = this.db
    let tasks = co.wrap(function * () {
      let conn = yield connection
      image.createdAt = new Date()
      image.tags = utils.extractTags(image.description)
      let result = yield r.db(db).table('images').insert(image).run(conn)
      if (result.errors > 0) {
        return Promise.reject(new Error(result.first_error))
      }

      image.id = result.generated_keys[0]
      yield r.db(db).table('images').get(image.id).update({
        publicId: uuid.encode(image.id)
      }).run(conn)

      // Por ultimo se resuelve la promesa para que nos
      // retorne el elemento de la base de datos y aseguramos
      // que sea el que requerimos
      let created = yield r.db(db).table('images').get(image.id).run(conn)

      return Promise.resolve(created)
    })
    return Promise.resolve(tasks()).asCallback(callback)
  }

  likeImage (id, callback) {
    if (!this.connected) {
      return Promise.reject(new Error('It is already disconnnected')).asCallback(callback)
    }

    let connection = this.connection
    let db = this.db
    let getImage = this.getImage.bind(this)
    // let imageId = uuid.decode(id)

    let tasks = co.wrap(function * () {
      let conn = yield connection
      // let image = yield r.db(db).table('images').get(imageId).run(conn)
      let image = yield getImage(id)
      yield r.db(db).table('images').get(image.id).update({
        liked: true,
        likes: image.likes + 1
      }).run(conn)
      let created = yield getImage(id)
      return Promise.resolve(created)
    })
    return Promise.resolve(tasks()).asCallback(callback)
  }

  getImage (id, callback) {
    if (!this.connected) {
      return Promise.reject(new Error('It is already disconnnected')).asCallback(callback)
    }

    let connection = this.connection
    let db = this.db
    let imageId = uuid.decode(id)

    let tasks = co.wrap(function * () {
      let conn = yield connection
      let image = yield r.db(db).table('images').get(imageId).run(conn)
      if (!image) {
        return Promise.reject(new Error(`image ${imageId} not found...`))
      }
      return Promise.resolve(image)
    })

    return Promise.resolve(tasks()).asCallback(callback)
  }

  getImages (id, callback) {
    if (!this.connected) {
      return Promise.reject(new Error('It is already disconnnected')).asCallback(callback)
    }

    let connection = this.connection
    let db = this.db

    let tasks = co.wrap(function * () {
      let conn = yield connection
      // Cuando se corre este codigo lo que se tiene es un cursor, un cursor es un objeto
      // el cual yo puedo navegar con metodo next para que entregue el siguiente resultado
      // y tambien tiene un metodo llamado toArray que nos permite transformar
      // ese cursor en un arreglo
      let images = yield r.db(db).table('images').orderBy({
        index: r.desc('createdAt')
      }).run(conn)
      let result = images.toArray()
      return Promise.resolve(result)
    })

    return Promise.resolve(tasks()).asCallback(callback)
  }

  saveUser (user, callback) {
    if (!this.connected) {
      return Promise.reject(new Error('It is already disconnnected')).asCallback(callback)
    }

    let connection = this.connection
    let db = this.db

    let tasks = co.wrap(function * () {
      let conn = yield connection
      user.password = utils.encrypt(user.password)
      user.createdAt = new Date()
      let result = yield r.db(db).table('users').insert(user).run(conn)
      if (result.errors > 0) {
        return Promise.reject(new Error(result.first_error))
      }
      user.id = result.generated_keys[0]
      let created = yield r.db(db).table('users').get(user.id).run(conn)
      return Promise.resolve(created)
    })

    return Promise.resolve(tasks()).asCallback(callback)
  }

  getUser (username, callback) {
    if (!this.connected) {
      return Promise.reject(new Error('It is already disconnnected')).asCallback(callback)
    }

    let connection = this.connection
    let db = this.db

    let tasks = co.wrap(function * () {
      let conn = yield connection
      yield r.db(db).table('users').indexWait().run(conn)
      let users = yield r.db(db).table('users').getAll(username, {
        // Le indicamos cual es el indice por el cual haremos la
        // consulta,
        index: 'username'
      }).run(conn)
      // Como la funcion getAll nos devuelve un cursor (un arreglo)
      // o un especia de iterable, tenemos que obetner el valor de cierta
      // manera, para obtener el primer valor disponible vamos a utilizar la
      // funcion next que retorna el primer valor
      // let result = users.next()
      let result = null
      try {
        result = yield users.next()
      } catch (e) {
        return Promise.reject(new Error(`user ${username} not found`))
      }
      return Promise.resolve(result)
    })

    return Promise.resolve(tasks()).asCallback(callback)
  }

  authenticate (username, password, callback) {
    if (!this.connected) {
      return Promise.reject(new Error('It is already disconnnected')).asCallback(callback)
    }
    // Ya que utilizaremos la funcion getUser dentro de la corutina, el contexto
    // de this no lo vamos a tener dentro de la funcion es por eso que usamos bind
    // para que este nuevo metodo que crearemos en la funcion generadora sea la funcion
    // tal cual la funcion getUser que esta definida en la clase y usarla sin ningun
    // problema dentro de task, obtenemos una referencia y le pasamos el contexto
    // global
    let getUser = this.getUser.bind(this)
    let tasks = co.wrap(function * () {
      // Ya que si utilizamos
      // this.getUser(), buscará el metodo getUser dentro del contexto de la
      // funcion generadora y this no estará definido y todo fallará
      // let user = yield getUser(username)
      let user = null
      try {
        user = yield getUser(username)
      } catch (e) {
        return Promise.resolve(false)
      }
      if (user.password === utils.encrypt(password)) {
        return Promise.resolve(true)
      }

      return Promise.resolve(false)
    })

    return Promise.resolve(tasks()).asCallback(callback)
  }

  getImagesByUser (userId, callback) {
    if (!this.connected) {
      return Promise.reject(new Error('It is already disconnnected')).asCallback(callback)
    }

    let connection = this.connection
    let db = this.db

    let tasks = co.wrap(function * () {
      let conn = yield connection
      // Lo siguiente se hace para esperar a que los indices sean creados
      // antes de realizar las consultas pues se toman tiempos para la creacion de
      // la base de datos hasta la creacion o insercion de los datos
      yield r.db(db).table('images').indexWait().run(conn)
      let images = yield r.db(db).table('images').getAll(userId, {
        // Le indicamos que debe de obtener las imagenes por el index userId
        index: 'userId'
      }).orderBy(r.desc('createdAt')).run(conn)
      // console.log('Este es el cursor', images)
      let result = yield images.toArray()
      // console.log('Ahora es el array', result)
      return Promise.resolve(result)
    })
    return Promise.resolve(tasks()).asCallback(callback)
  }

  getImagesByTag (tag, callback) {
    if (!this.connected) {
      return Promise.reject(new Error('It is already disconnnected')).asCallback(callback)
    }

    let connection = this.connection
    let db = this.db

    tag = utils.normalize(tag)

    let tasks = co.wrap(function * () {
      let conn = yield connection
      yield r.db(db).table('images').indexWait().run(conn)
      // Realizamos el query pero con los parametros de los tags
      // de tal manera que el tag normalizado lo buscaremos mediante
      // filtros ya que los tags no es una llave primaria
      let images = yield r.db(db).table('images').filter((img) => {
        return img('tags').contains(tag)
      }).orderBy(r.desc('createdAt')).run(conn)
      let result = yield images.toArray()
      return Promise.resolve(result)
    })
    return Promise.resolve(tasks()).asCallback(callback)
  }
}

module.exports = Db

// Codigo comentado
// 'use strict'
//
// const co = require('co')
// const r = require('rethinkdb')
// // Requerimos bluebird de tal manera que cuando no nos pasen un callback,
// // podemos retornar una promesa
// const Promise = require('bluebird')
// // Vamos a asignar parametros por default sin embargo,
// // estos pueden ser sobrescritos gracias al constructor
// // de la clase
//
// const defaults = {
//   host: 'localhost',
//   port: 28015, //Puerto por defecto de rethinkdb
//   db: 'platzigram' //Base de datos por defecto
// }
//
// class Db {
//   constructor (options) {
//     options = options || {}
//     this.host = options.host || defaults.host
//     this.port = options.port || defaults.port
//     this.db = options.db || defaults.db
//   }
//   // Creamos una funcion que conecte nuestra aplicacion
//    // a la base de datos haciendo uso de connect(), un
//   //  metodo que proviene de la importacion del paquete de
//   //  rethinkdb
//   connect (callback) {
//     // Se instancia la conexion del obejto actual, este
//     // metodo puede ser llamado con varios parametros de tal manera
//     // que podemos decirle que host y que puerta queremos que se
//     // haga la conexion, de acuerdo a la arquitectura que tenemos
//     // para este proyecto queremos que esto sea configurable
//     this.connection = r.connect({
//       host: this.host,
//       port: this.port
//     })
//
//     // Utilizamos a CO para correr subrutinas unas alternativa
//     // para poder usar async/await pero utilizando funciones
//     // generadoras y yield ya que no hemos usado babel en el
//     // proyecto. Vamos a crear una serie de funciones
//
//     // Dado que dentro de las funciones no tendremos el this
//     // del ambiente global y tendremos el this del ambiente local
//     // de las funciones, guardamos los this antes
//     let db = this.db
//     let connection = this.connection
//
//     // Setup (entrega una promesa) es una funcion generadora
//     // corriendo sobre CO que retornara una promesa,
//     // utilizamos una funcion generadora como alternativa
//     // de async y utilizamos yield como alternativa de await
//     let setup = co.wrap(function * () { //Se apoya en una corrutina
//       // Similar a una promesa, realizamos la conexion a la base de datos
//       let conn = yield connection
//       // De esta manera, vemos si existe la base de datos y corremos
//       // estos comando con .run(conn) (esto es como si le dieramos run
//       // al boton en el explorer y siempre lo usaremos dentro de  nodejs)
//
//       // yield resuelve la promesa que nos devuelva la conexion de consulta
//       // y dbList ya tendra la promesa resuelta y tendremos el arreglo con la base
//       // de datos
//       let dbList = yield r.dbList().run(conn)
//       // Aqui checamos si dbList contiene la base de datos que le hemos seteado, si
//       // no la tiene nos retornará un -1 y entonces la crearemos
//       if (dbList.indexOf(db) === -1) {
//         // yield nos resuelve las promesas y espera hasta que se
//         // resuelvan las promesas
//         yield r.dbCreate(db).run(conn)
//       }
//
//       let dbTables = yield r.db(db).tableList().run(conn)
//       if (dbTables('images') === -1) {
//         yield r.db(db).tableCreate('images').run(conn)
//       }
//
//       if (dbTables('users') === -1) {
//         // yield pausa la ejecucion y resuelve las promesas
//         // similar a await
//         yield r.db(db).tableCreate('users').run(conn)
//       }
//       // Ya que hayamos resuelto todas las promesas se devolvera
//       // la conn ya con todas las bases de datos creadas
//       return conn
//     })
//     // Con esta linea indicamos que si no se le pasa un callback,
//     // retornaremos una promesa y si se pasa un callback se retorna como tal
//     // y se soluciona esa promesa/callback, enviando la conexion
//     return Promise.resolve(setup()).asCallback(callback)
//   }
// }
//
// module.exports = Db
