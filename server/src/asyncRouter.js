import express from 'express';

function wrap(handler) {
  if (typeof handler !== 'function') return handler;
  if (handler.length >= 4) return handler;
  return function wrapped(req, res, next) {
    try {
      const result = handler(req, res, next);
      if (result && typeof result.catch === 'function') result.catch(next);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * 与 express.Router 用法一致，但自动把异步处理器的异常交给统一错误中间件。
 * Express 4 不会自动捕获 Promise 拒绝，因此路由统一用这个工厂创建。
 */
export function createRouter() {
  const router = express.Router();
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'use', 'all']) {
    const original = router[method].bind(router);
    router[method] = (...args) =>
      original(...args.map((arg) => (typeof arg === 'function' ? wrap(arg) : arg)));
  }
  return router;
}
