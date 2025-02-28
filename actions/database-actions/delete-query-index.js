// Licensed to the Apache Software Foundation (ASF) under one or more contributor
// license agreements; and to You under the Apache License, Version 2.0.

/**
 * Delete a Cloudant index:
 * https://docs.cloudant.com/cloudant_query.html#deleting-an-index
 **/

var DESIGN_PREFIX = '_design/';

function main(message) {
  var cloudantOrError = getCloudantAccount(message);
  if (typeof cloudantOrError !== 'object') {
    return Promise.reject(cloudantOrError);
  }
  var cloudant = cloudantOrError;
  var dbName = message.dbname;
  var docId = message.docid;
  var indexName = message.indexname;
  var indexType = message.indextype;

  if (!dbName) {
    return Promise.reject('dbname is required.');
  }
  if (!docId) {
    return Promise.reject('docid is required.');
  }
  if (!indexName) {
    return Promise.reject('indexname is required.');
  }
  if (!indexType) {
    return Promise.reject('indextype is required.');
  }

  return deleteIndexFromDesignDoc(cloudant, docId, indexName, indexType, dbName);
}

function deleteIndexFromDesignDoc(cloudant, docId, indexName, indexType, dbName) {

  return new Promise(function(resolve, reject) {
    var path = "_index/" + encodeURIComponent(docId) + '/' + encodeURIComponent(indexType) +
        '/' + encodeURIComponent(indexName);

    cloudant.request({ db: encodeURIComponent(dbName),
        method : 'delete',
        path : path
      }, function(error, response) {
      if (!error) {
        console.log('success', response);
        resolve(response);
      } else {
        console.log('error', error);
        reject(error);
      }
    });

  });
}

function getCloudantAccount(message) {
  // full cloudant URL - Cloudant NPM package has issues creating valid URLs
  // when the username contains dashes (common in Bluemix scenarios)
  var cloudantUrl;

  if (message.url) {
    // use bluemix binding
    cloudantUrl = message.url;
  } else {
    if (!message.host) {
      return 'cloudant account host is required.';
    }
    if (!message.username) {
      return 'cloudant account username is required.';
    }
    if (!message.password) {
      return 'cloudant account password is required.';
    }

    cloudantUrl = "https://" + message.username + ":" + message.password + "@" + message.host;
  }

  return require('cloudant')({
    url: cloudantUrl
  });
}
