import Router from 'koa-router'
import Redis from 'koa-redis'
import nodeMailer from 'nodemailer'
import User from '../dbs/models/users'
import Passport from './utils/passport'
import Email from '../dbs/models/config'
import axios from './utils/axios'

let router = new Router({
  prefix: '/users'
})

let Store = new Redis().client

router.post('/signup', async (ctx) => {
  const { username, password, email, code } = ctx.request.body
  if (code) {
    const saveCode = await Store.hget(`nodemail:${username}`, 'code')
    const saveExpire = await Store.hget(`nodemail:${username}`, 'expire')
    if (code === saveCode) {
      if (new Date().getTime() - saveExpire > 0) {
        ctx.body = {
          code: -1,
          msg: '验证码已过期，请重新尝试'
        }
        return false
      } else {
        ctx.body = {
          code: -1,
          msg: '请填写正确的验证码'
        }
      }
    }
  } else {
    ctx.body = {
      code: -1,
      msg: '请填写验证码'
    }
  }
  let user = await User.find({
    username
  })
  if (user.length) {
    ctx.body = {
      code: -1,
      msg: '已被注册'
    }
    return
  }
  // 验证码正确+首次注册=可以写库
  let nuser = await User.create({
    username,
    password,
    email
  })
  // 验证写库是否成功
  if (nuser) {
    let res = await axios.post('/users/signin', {
      username,
      password
    })
    if (res.data && res.data.code === 0) {
      ctx.body = {
        code: 0,
        msg: '注册成功',
        user: res.data.user
      }
    } else {
      ctx.body = {
        code: -1,
        msg: 'error'
      }
    }
  } else {
    ctx.body = {
      code: -1,
      msg: '注册失败'
    }
  }
})

router.post('/signin', async (ctx, next) => {
  // 'local' 指的是使用 local 策略
  return Passport.authenticate('local', function (err, user, info, status) {
    if (err) {
      ctx.body = {
        code: -1,
        msg: err
      }
    } else {
      if (user) {
        ctx.body = {
          code: 0,
          msg: '登陆成功',
          user
        }
        // 若验证成功，做一个登陆的动作
        return ctx.login(user)
      } else {
        ctx.body = {
          code: 1,
          msg: info
        }
      }
    }
  })(ctx, next)
})

router.post('/verify', async (ctx, next) => {
  let username = ctx.request.body.username
  const saveExpire = await Store.hget(`nodemail:${username}`, 'expire')
  if (saveExpire && new Date().getTime() - saveExpire < 0) {
    ctx.body = {
      code: -1,
      msg: '验证请求过于频繁，1分钟内1次'
    }
    return false
  }
  // 创建 smtp 服务
  //   发送对象
  let transporter = nodeMailer.createTransport({
    host: Email.smtp.host,
    port: 587,
    secure: false, // true，监听 465 端口；false 监听其他端口
    auth: {
      user: Email.smtp.user,
      pass: Email.smtp.pass
    }
  })
  //   接收信息
  let ko = {
    code: Email.smtp.code(),
    expire: Email.smtp.expire(),
    email: ctx.request.body.email,
    user: ctx.request.body.username
  }
  //    邮件中显示内容
  let mailOptions = {
    from: `"认证邮件" <${Email.smtp.user}>`,
    to: ko.email,
    subject: '《高仿美团网》 注册码',
    html: `您在 《高仿美团网》 中注册，您的邀请码是${ko.code}`
  }

  await transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return console.log('error')
    } else {
      Store.hmset(`nodemail:${ko.user}`, 'code', ko.code, 'expire', ko.expire, 'email', ko.email)
    }
  })
  ctx.body = {
    code: 0,
    msg: '验证码已发送，可能会有延时，有效期1分钟'
  }
})

router.get('/exit', async (ctx, next) => {
  // 做一个退出的动作
  await ctx.logout()
  // 检查是不是登录状态
  if (!ctx.isAuthenticated()) {
    // 注销成功，返回 code 0
    ctx.body = {
      code: 0
    }
  } else {
    ctx.body = {
      code: -1
    }
  }
})

router.get('/getUser', (ctx) => {
  if (ctx.isAuthenticated()) {
    // 之前 passport 会把用户信息的 session 放到 session 对象中，所以这里会有 passport 的信息
    const { username, email } = ctx.session.passport.user
    ctx.body = {
      user: username,
      email
    }
  } else {
    ctx.body = {
      user: '',
      email: ''
    }
  }
})

export default router
