// @flow

import util from 'util'
import uri from 'url'
import pjson from '../package.json'
import http from 'http'
import https from 'https'
import querystring from 'querystring'

function concat (stream) {
  return new Promise(resolve => {
    let strings = []
    stream.on('data', data => strings.push(data))
    stream.on('end', () => resolve(strings.join('')))
  })
}

type Method = | "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
type Headers = {[key: string]: string}
type Protocol = | 'https:' | 'http:'
type Json = | string | number | boolean | null | JsonObject | JsonArray // eslint-disable-line
type JsonObject = { [key:string]: Json }
type JsonArray = Json[]

/**
 * @typedef {Object} RequestOptions
 * @property {Object.<string, string>} headers - request headers
 * @property {string} method - request method (GET/POST/etc)
 * @property {(string)} body - request body. Sets content-type to application/json and stringifies when object
 */
export type RequestOptions = {
  method: Method,
  headers: Headers,
  raw?: boolean,
  host?: string,
  protocol?: Protocol,
  body?: any
}

/**
 * Utility for simple HTTP calls
 * @class
 */
export default class HTTP {
  /**
   * make an http GET request
   * @param {string} url - url or path to call
   * @param {RequestOptions} options
   * @returns {Promise}
   * @example
   * ```js
   * const http = require('http-call')
   * await http.get('https://google.com')
   * ```
   */
  static async get (url, options: $Shape<RequestOptions> = {}) {
    options.method = 'GET'
    let http = new this(url, options)
    await http.request()
    return http.body
  }

  /**
   * make an http POST request
   * @param {string} url - url or path to call
   * @param {RequestOptions} options
   * @returns {Promise}
   * @example
   * ```js
   * const http = require('http-call')
   * await http.post('https://google.com')
   * ```
   */
  static async post (url, options: $Shape<RequestOptions> = {}) {
    options.method = 'POST'
    let optionsBody = {}
    Object.assign(optionsBody, options.body)
    let postBody = querystring.stringify(optionsBody)
    delete options.body
    let http = new this(url, options)
    http.postBody = postBody
    http.headers['Content-Type'] = 'application/x-www-form-urlencoded'
    http.headers['Content-Length'] = Buffer.byteLength(postBody).toString()
    await http.request()
    return http.body
  }

  /**
   * make a streaming request
   * @param {string} url - url or path to call
   * @param {RequestOptions} options
   * @returns {Promise}
   * @example
   * ```js
   * const http = require('http-call')
   * let rsp = await http.get('https://google.com')
   * rsp.on('data', console.log)
   * ```
   */
  static async stream (url: string, options: $Shape<RequestOptions> = {}) {
    options.method = 'GET'
    options.raw = true
    let http = new this(url, options)
    await http.request()
    return http.response
  }

  method: Method = 'GET'
  host = 'localhost'
  port = 0
  protocol = 'https:'
  path = '/'
  raw = false
  headers: Headers = {
    'user-agent': `${pjson.name}/${pjson.version} node-${process.version}`
  }
  response: http$IncomingMessage
  postBody: Json
  body: any

  constructor (url: string, options: $Shape<RequestOptions> = {}) {
    if (!url) throw new Error('no url provided')
    let headers = Object.assign(this.headers, options.headers)
    Object.assign(this, options)
    this.headers = headers
    let u = uri.parse(url)
    this.protocol = u.protocol || this.protocol
    this.host = u.host || this.host
    this.port = u.port || this.port || (this.protocol === 'https:' ? 443 : 80)
    this.path = u.path || this.path
  }

  async request () {
    this.response = await this.performRequest()
    if (this.response.statusCode >= 200 && this.response.statusCode < 300) {
      if (!this.raw) this.body = await this.parse(this.response)
    } else throw new this.HTTPError(this, await this.parse(this.response))
  }

  get http (): (typeof http | typeof https) {
    return this.protocol === 'https:' ? https : http
  }

  get url (): string {
    return `${this.protocol}//${this.host}${this.path}`
  }

  performRequest () {
    return new Promise((resolve, reject) => {
      let request = this.http.request(this, resolve)
      request.on('error', reject)
      if (this.method === 'POST') request.write(this.postBody)
      request.end()
    })
  }

  async parse (response: http$IncomingMessage) {
    let body = await concat(response)
    return response.headers['content-type'] === 'application/json'
      ? JSON.parse(body) : body
  }

  HTTPError = class HTTPError extends Error {
    statusCode: number

    constructor (http: HTTP, body: Json) {
      body = `\n${util.inspect(body)}`
      super(`HTTP Error ${http.response.statusCode} for ${http.method} ${http.url}${body}`)
      this.statusCode = http.response.statusCode
    }
  }
}
