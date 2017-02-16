const util = require('util')
const url = require('url')

function concat (stream) {
  return new Promise(resolve => {
    let strings = []
    stream.on('data', data => strings.push(data))
    stream.on('end', () => resolve(strings.join('')))
  })
}

function mergeOptions (...optionses) {
  let options = {headers: {}}
  for (let o of optionses) {
    for (let k of Object.keys(o)) {
      if (k === 'headers') Object.assign(options.headers, o.headers)
      else options[k] = o[k]
    }
  }
  return options
}

class HTTPError extends Error {
  constructor (response, body) {
    super(`HTTP Error ${response.statusCode} for ${response.req.method} ${response.req._headers.host}${response.req.path}\n${util.inspect(body)}`)
  }
}

function performRequest (options) {
  let http = options.protocol === 'https:'
    ? require('https')
    : require('http')

  return new Promise((resolve, reject) => {
    let request = http.request(options, response => resolve({response, options}))
    request.on('error', reject)
    request.end()
  })
}

function parse ({response, options}) {
  if (options.raw) return Promise.resolve(response)
  return concat(response).then(body => {
    return response.headers['content-type'] === 'application/json'
      ? JSON.parse(body)
      : body
  })
}

function handleResponse (r) {
  return parse(r)
  .then(body => {
    r.body = body
    return Promise.resolve(r.options.responseMiddleware ? r.options.responseMiddleware(r) : r)
  }).then(() => {
    if (r.response.statusCode >= 200 && r.response.statusCode < 300) {
      return r.body
    } else {
      throw new HTTPError(r, r.body)
    }
  })
}

/**
 * Utility for simple HTTP calls
 * @class
 */
class HTTP {
  constructor (options = {}) {
    this.options = options
  }

  /**
   * make a simple http request
   * @param url {string} - url or path to call
   * @param options {object}
   * @example
   * ```js
   * const http = require('http-call')
   * await http.get('https://google.com')
   * ```
   */
  static get (url, options = {}) {
    const http = new HTTP()
    return http._request(Object.assign({}, options, {
      method: 'GET',
      url
    }))
  }

  get (url, options = {}) {
    return this._request(Object.assign({}, options, {
      method: 'GET',
      url
    }))
  }

  _request (options) {
    options = mergeOptions({
      headers: {'User-Agent': this._userAgent}
    }, this.options, options)

    let u = url.parse(options.url)
    options.host = u.host
    options.port = u.port || (u.protocol === 'https:' ? 443 : 80)
    options.path = u.path
    options.protocol = u.protocol

    return Promise.resolve(options.requestMiddleware ? options.requestMiddleware(options) : options)
    .then(options => performRequest(options))
    .then(response => handleResponse(response))
  }

  get _userAgent () {
    const version = require('./package.json').version
    return `http-call/${version}`
  }

}

module.exports = HTTP
