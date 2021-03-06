// *****************************************************************************
// Copyright 2016 Aerospike, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License")
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ****************************************************************************

const Aerospike = require('../lib/aerospike')
const Info = require('../lib/info')
const options = require('./util/options')
const expect = require('expect.js')
const util = require('util')
const path = require('path')

global.expect = expect

exports.options = options
exports.namespace = options.namespace
exports.set = options.set

exports.keygen = require('./generators/key')
exports.metagen = require('./generators/metadata')
exports.recgen = require('./generators/record')
exports.valgen = require('./generators/value')
exports.putgen = require('./generators/put')

const config = options.getConfig()
exports.config = config

const client = Aerospike.client(config)
exports.client = client

function UDFHelper (client) {
  this.client = client
}

UDFHelper.prototype.register = function (filename, callback) {
  var script = path.join(__dirname, filename)
  var self = this
  this.client.udfRegister(script, function (err) {
    if (err) throw err
    self.client.udfRegisterWait(filename, 50, function (err) {
      if (err) throw err
      callback()
    })
  })
}

UDFHelper.prototype.remove = function (filename, callback) {
  this.client.udfRemove(filename, function (err) {
    if (err && err.code !== Aerospike.status.AEROSPIKE_ERR_UDF) throw err
    callback()
  })
}

function IndexHelper (client) {
  this.client = client
}

IndexHelper.prototype.create = function (indexName, setName, binName, dataType, indexType, callback) {
  var index = {
    ns: options.namespace,
    set: setName,
    bin: binName,
    index: indexName,
    type: indexType || Aerospike.indexType.DEFAULT,
    datatype: dataType
  }
  this.client.createIndex(index, function (err, job) {
    if (err) throw err
    job.waitUntilDone(100, function (err) {
      if (err) throw err
      callback()
    })
  })
}

IndexHelper.prototype.remove = function (indexName, callback) {
  this.client.indexRemove(options.namespace, indexName, {}, callback)
}

function ServerInfoHelper () {
  this.features = new Set()
  this.nsconfig = {}
  this.cluster = []
}

ServerInfoHelper.prototype.supports_feature = function (feature) {
  return this.features.has(feature)
}

ServerInfoHelper.prototype.ldt_enabled = function () {
  return this.nsconfig['ldt-enabled'] === 'true'
}

ServerInfoHelper.prototype.fetch_info = function () {
  var self = this
  client.infoAll('features', function (err, results) {
    if (err) throw err
    results.forEach(function (response) {
      var features = Info.parseInfo(response.info)['features']
      if (Array.isArray(features)) {
        features.forEach(function (feature) {
          self.features.add(feature)
        })
      }
    })
  })
}

ServerInfoHelper.prototype.fetch_namespace_config = function (ns) {
  var self = this
  var nsKey = 'namespace/' + ns
  client.infoAll(nsKey, function (err, results) {
    if (err) throw err
    var info = results.pop()['info']
    self.nsconfig = Info.parseInfo(info)[nsKey]
  })
}

var udfHelper = new UDFHelper(client)
var indexHelper = new IndexHelper(client)
var serverInfoHelper = new ServerInfoHelper(client)

exports.udf = udfHelper
exports.index = indexHelper
exports.cluster = serverInfoHelper

exports.fail = function fail (message) {
  if (typeof message !== 'string') {
    message = util.inspect(message)
  }
  expect().fail(message)
}

/* global before */
before(function (done) {
  client.connect(function (err) {
    if (err) throw err
    serverInfoHelper.fetch_info()
    serverInfoHelper.fetch_namespace_config(options.namespace)
    done()
  })
})

/* global after */
after(function (done) {
  client.close()
  done()
})
