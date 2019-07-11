// const Koa = require('koa')
import Koa from 'koa'
const consola = require('consola')
const { Nuxt, Builder } = require('nuxt')

import mongoose from 'mongoose'
import bodyParser from 'koa-bodyparser'
import session from 'koa-generic-session' // 读写 session
import Redis from 'koa-redis'
import json from 'koa-json' // 对 服务端向客户端发送json 进行美化
import dbConfig from './dbs/models/config'
import passport from './interface/utils/passport'
import users from './interface/users'

const app = new Koa()

// Import and Set Nuxt.js options
const config = require('../nuxt.config.js')
config.dev = !(app.env === 'production')

async function start() {
  // Instantiate nuxt.js
  const nuxt = new Nuxt(config)

  const {
    host = process.env.HOST || '127.0.0.1',
    port = process.env.PORT || 3000
  } = nuxt.options.server

  app.keys = ['mt', 'keyskeys']
  app.proxy = true
  // session redis 存储，启动数据库
  app.use(session({
    key: 'mt',
    prefix: 'mt:uid',
    store: new Redis()
  }))
  // post 请求处理
  app.use(bodyParser({
    extendTypes: ['json', 'form', 'text']
  }))
  app.use(json())
  // 数据库连接
  mongoose.connect(dbConfig.dbs, {
    useNewUrlParser: true
  })
  // sessin 和 passport 相关配置连接
  app.use(passport.initialize())
  app.use(passport.session())

  // Build in development
  if (config.dev) {
    const builder = new Builder(nuxt)
    await builder.build()
  } else {
    await nuxt.ready()
  }
  // 使用路由
  app.use(users.routes()).use(users.allowedMethods())
  app.use((ctx) => {
    ctx.status = 200
    ctx.respond = false // Bypass Koa's built-in response handling
    ctx.req.ctx = ctx // This might be useful later on, e.g. in nuxtServerInit or with nuxt-stash
    nuxt.render(ctx.req, ctx.res)
  })

  app.listen(port, host)
  consola.ready({
    message: `Server listening on http://${host}:${port}`,
    badge: true
  })
}

start()
