'use strict'
// En este archivo crearemos todos los test de nuestra base
// de datos
const Db = require('../')
const test = require('ava')
const r = require('rethinkdb')
const uuid = require('uuid-base62')
const fixtures = require('./fixtures')
const utils = require('../lib/utils')

// Ava nos permite ejecutar hooks que son metodos que se ejecutan antes y
// despues de los test, beforeEach nos ayuda a realizar las acciones
// correspondientes por cada test y antes de cada uno
test.beforeEach('setup database', async (t) => {
  const dbName = `Platzigram_${uuid.v4()}`
  // Pasamos el parametro true para que se reinicie cero
  // la configuracion de la base de datos
  const db = new Db({ db: dbName, setup: true })
  await db.connect()
  t.context.db = db
  t.context.dbName = dbName
  t.true(db.connected, 'should be connected')
})

// console.log('Esta es la diferencia de uuid() y v4()')
// console.log(uuid.uuid())
// console.log(uuid.v4())

test.afterEach.always('disconnected from database and cleanup it', async (t) => {
  let db = t.context.db
  let dbName = t.context.dbName
  await db.disconnect()
  t.false(db.connected, 'should be disconnected')
  let conn = await r.connect({})
  await r.dbDrop(dbName).run(conn)
})

// Este test siempre se ejecuta auqnue existan errores en el codigo
// debido a la palabra reservada always
// test.after.always('clear database', async (t) => {
//   let conn = await r.connect({})
//   await r.dbDrop(dbName).run(conn)
// })

test('save image', async (t) => {
  let db = t.context.db
  t.is(typeof db.saveImage, 'function', 'saveImage is a function')
  let image = fixtures.getImage()

  let created = await db.saveImage(image)
  // Aqui testeamos que el objeto que devuelva la promesa, tenga
  // la misma url de la imagen que creamos aleatoriamente
  t.is(created.description, image.description)
  t.is(created.url, image.url)
  t.is(created.likes, image.likes)
  t.is(created.liked, image.liked)
  t.deepEqual(created.tags, ['awesome', 'tags', 'platzi'])
  t.is(created.userId, image.userId)
  t.is(typeof created.id, 'string')
  t.is(created.publicId, uuid.encode(created.id))
  t.truthy(created.createdAt)
})

test('Like Image', async (t) => {
  let db = t.context.db
  t.is(typeof db.likeImage, 'function', 'likeImage is a function')
  let image = fixtures.getImage()
  let created = await db.saveImage(image)
  let result = await db.likeImage(created.publicId)
  t.true(result.liked)
  t.is(result.likes, image.likes + 1)
})

// Este test nos ayuda a saber si estamos obteniendo de manera correcta
// las imagenes que se encuentran en la base de datos a tráves de los
// metodos de la misma
test('Get Image', async (t) => {
  let db = t.context.db
  t.is(typeof db.getImage, 'function', 'getImage is a function')
  let image = fixtures.getImage()
  let created = await db.saveImage(image)
  let result = await db.getImage(created.publicId)
  t.deepEqual(created, result)
  await t.throws(db.getImage('foo'), /not found/)
})

test('List all images', async (t) => {
  let db = t.context.db
  let images = fixtures.getImages(3)
  let saveImages = images.map((image) => db.saveImage(image))
  let created = await Promise.all(saveImages)
  let result = await db.getImages()
  t.is(created.length, result.length)
})

test('Encrypt password', (t) => {
  let password = 'foo123'
  // Vamos a encriptar con sha256 y que no presenta problemas
  // con algoritmos como md5 o sha1
  let encrypted = '02b353bf5358995bc7d193ed1ce9c2eaec2b694b21d2f96232c9d6a0832121d1'
  let result = utils.encrypt(password)
  // console.log(result)
  // console.log(encrypted)
  t.is(result, encrypted)
})

test('Save user', async (t) => {
  let db = t.context.db
  t.is(typeof db.saveUser, 'function', 'saveUser is a function')
  let user = fixtures.getUser()
  let plainPassword = user.password
  let created = await db.saveUser(user)
  t.is(user.username, created.username)
  t.is(user.email, created.email)
  t.is(user.name, created.name)
  t.is(utils.encrypt(plainPassword), created.password)
  t.is(typeof created.id, 'string')
  t.truthy(created.createdAt)
})

test('Get user', async (t) => {
  let db = t.context.db
  t.is(typeof db.getUser, 'function', 'getUser is a function')
  let user = fixtures.getUser()
  let created = await db.saveUser(user)
  let result = await db.getUser(user.username)
  t.deepEqual(created, result)
  await t.throws(db.getUser('foo'), /not found/)
})

test('Authenticate user', async (t) => {
  let db = t.context.db
  t.is(typeof db.authenticate, 'function', 'authenticate is a function')
  let user = fixtures.getUser()
  let plainPassword = user.password
  await db.saveUser(user)
  let success = await db.authenticate(user.username, plainPassword)
  t.true(success)
  let fail = await db.authenticate(user.username, 'foo')
  t.false(fail)
  let failure = await db.authenticate('foo', 'bar')
  t.false(failure)
})

test('List Images by User', async (t) => {
  let db = t.context.db
  t.is(typeof db.getImagesByUser, 'function', 'getImagesByUser is a function')
  let images = fixtures.getImages(10)
  // Generamos un userId como lo haría RethinkDB
  let userId = uuid.uuid()
  let random = Math.round(Math.random() * images.length)
  // Arreglo de promesas para guardar las imagenes
  let saveImages = []
  for (let i = 0; i < images.length; i++) {
    if (i < random) {
      images[i].userId = userId
    }
    // Aqui no resolvemos la promesa, solo estamos guardando
    // el arreglo de promesas, ya sean exitosas o no.
    saveImages.push(db.saveImage(images[i]))
  }
  // En este codigo ya resolvemos las promesas y realizamos la
  // operacion de guardar las imagenes del arreglo de promesas
  // que se tiene
  await Promise.all(saveImages)
  // Obtenemos el resultado de la operacion de obtener solo
  // las imagenes del usuario
  let result = await db.getImagesByUser(userId)
  t.is(result.length, random)
})

test('List Images by Tag', async (t) => {
  let db = t.context.db
  t.is(typeof db.getImagesByTag, 'function', 'getImagesByTag is a function')
  let images = fixtures.getImages(10)
  let tag = '#filterit'
  let random = Math.round(Math.random() * images.length)
  // Arreglo de promesas para guardar las imagenes
  let saveImages = []
  for (let i = 0; i < images.length; i++) {
    if (i < random) {
      images[i].description = tag
    }
    saveImages.push(db.saveImage(images[i]))
  }
  await Promise.all(saveImages)
  let result = await db.getImagesByTag(tag)
  t.is(result.length, random)
})
