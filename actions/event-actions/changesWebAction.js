// Licensed to the Apache Software Foundation (ASF) under one or more contributor
// license agreements; and to You under the Apache License, Version 2.0.

const moment = require('moment');
const common = require('./lib/common');
const Database = require('./lib/Database');

function main(params) {

    if (!params.triggerName) {
        return common.sendError(400, 'no trigger name parameter was provided');
    }

    var triggerParts = common.parseQName(params.triggerName);
    var triggerData = {
        apikey: params.authKey,
        name: triggerParts.name,
        namespace: triggerParts.namespace,
        additionalData: common.constructObject(params.additionalData),
    };
    var triggerID = `:${triggerParts.namespace}:${triggerParts.name}`;

    var workers = params.workers instanceof Array ? params.workers : [];
    var db;

    if (params.__ow_method === "post") {

        // check for parameter errors
        if (!params.dbname) {
            return common.sendError(400, 'cloudant trigger feed: missing dbname parameter');
        }
        if (!params.host) {
            return common.sendError(400, 'cloudant trigger feed: missing host parameter');
        }
        if (!params.iamApiKey) {
            if (!params.username || !params.password) {
                return common.sendError(400, 'cloudant trigger feed: Must specify parameter/s of iamApiKey or username/password');
            }
        }

        var query_params;

        if (params.filter) {
            query_params = params.query_params;
            if (typeof queryParams === 'string') {
                try {
                    query_params = JSON.parse(params.query_params);
                }
                catch (e) {
                    return common.sendError(400, 'The query_params parameter cannot be parsed. Ensure it is valid JSON.');
                }
            }
            if (query_params && typeof query_params !== 'object') {
                return common.sendError(400, 'The query_params parameter is not a valid JSON Object');
            }
        }
        else if (params.query_params) {
            return common.sendError(400, 'The query_params parameter is only allowed if the filter parameter is defined');
        }

        return new Promise(function (resolve, reject) {
            var newTrigger;

            common.verifyTriggerAuth(triggerData, false)
            .then(() => {
                db = new Database(params.DB_URL, params.DB_NAME);

                newTrigger = {
                    id: triggerID,
                    host: params.host,
                    port: params.port,
                    protocol: params.protocol || 'https',
                    dbname: params.dbname,
                    user: params.username,
                    pass: params.password,
                    apikey: triggerData.apikey,
                    since: params.since,
                    maxTriggers: params.maxTriggers || -1,
                    filter: params.filter,
                    query_params: query_params,
                    status: {
                        'active': true,
                        'dateChanged': Date.now()
                    },
                    additionalData: triggerData.additionalData,
                    iamApiKey: params.iamApiKey,
                    iamUrl: params.iamUrl || 'https://iam.bluemix.net/identity/token'
                };
                return verifyUserDB(newTrigger);
            })
            .then(() => {
                return db.getWorkerID(workers);
            })
            .then((worker) => {
                console.log('trigger will be assigned to worker ' + worker);
                newTrigger.worker = worker;
                return db.createTrigger(triggerID, newTrigger);
            })
            .then(() => {
                resolve({
                    statusCode: 200,
                    headers: {'Content-Type': 'application/json'},
                    body: {'status': 'success'}
                });
            })
            .catch(err => {
                reject(err);
            });
        });

    }
    else if (params.__ow_method === "get") {
        return new Promise(function (resolve, reject) {
            common.verifyTriggerAuth(triggerData, false)
            .then(() => {
                db = new Database(params.DB_URL, params.DB_NAME);
                return db.getTrigger(triggerID);
            })
            .then(doc => {
                var body = {
                    config: {
                        name: doc.id.split(':')[2],
                        namespace: doc.id.split(':')[1],
                        host: doc.host,
                        port: doc.port,
                        protocol: doc.protocol,
                        dbname: doc.dbname,
                        username: doc.user,
                        password: doc.pass,
                        since: doc.since,
                        filter: doc.filter,
                        query_params: doc.query_params,
                        iamApiKey: doc.iamApiKey,
                        iamUrl: doc.iamUrl
                    },
                    status: {
                        active: doc.status.active,
                        dateChanged: moment(doc.status.dateChanged).utc().valueOf(),
                        dateChangedISO: moment(doc.status.dateChanged).utc().format(),
                        reason: doc.status.reason
                    }
                };
                resolve({
                    statusCode: 200,
                    headers: {'Content-Type': 'application/json'},
                    body: body
                });
            })
            .catch(err => {
                reject(err);
            });
        });
    }
    else if (params.__ow_method === "put") {

        return new Promise(function (resolve, reject) {
            var updatedParams = {};

            common.verifyTriggerAuth(triggerData, false)
            .then(() => {
                db = new Database(params.DB_URL, params.DB_NAME);
                return db.getTrigger(triggerID);
            })
            .then(trigger => {
                if (trigger.status && trigger.status.active === false) {
                    return reject(common.sendError(400, `${params.triggerName} cannot be updated because it is disabled`));
                }

                if (params.filter || params.query_params) {
                    updatedParams.filter = trigger.filter;
                    updatedParams.query_params = trigger.query_params;
                }
                else {
                    return reject(common.sendError(400, 'At least one of filter or query_params parameters must be supplied'));
                }

                if (params.filter) {
                    updatedParams.filter = params.filter;
                }

                if (params.query_params) {
                    if (updatedParams.filter) {
                        var query_params = params.query_params;
                        if (typeof query_params === 'string') {
                            try {
                                query_params = JSON.parse(params.query_params);
                            }
                            catch (e) {
                                return reject(common.sendError(400, 'The query_params parameter cannot be parsed. Ensure it is valid JSON.'));
                            }
                        }
                        if (typeof query_params !== 'object') {
                            return reject(common.sendError(400, 'The query_params parameter is not a valid JSON Object'));
                        }
                        updatedParams.query_params = query_params;
                    }
                    else {
                        return reject(common.sendError(400, 'The query_params parameter is only allowed if the filter parameter is defined'));
                    }
                }
                return db.disableTrigger(triggerID, trigger, 0, 'updating');
            })
            .then(triggerID => {
                return db.getTrigger(triggerID);
            })
            .then(trigger => {
                return db.updateTrigger(triggerID, trigger, updatedParams, 0);
            })
            .then(() => {
                resolve({
                    statusCode: 200,
                    headers: {'Content-Type': 'application/json'},
                    body: {'status': 'success'}
                });
            })
            .catch(err => {
                reject(err);
            });
        });
    }
    else if (params.__ow_method === "delete") {

        return new Promise(function (resolve, reject) {
            common.verifyTriggerAuth(triggerData, true)
            .then(() => {
                db = new Database(params.DB_URL, params.DB_NAME);
                return db.getTrigger(triggerID);
            })
            .then(trigger => {
                return db.disableTrigger(triggerID, trigger, 0, 'deleting');
            })
            .then(triggerID => {
                return db.deleteTrigger(triggerID, 0);
            })
            .then(() => {
                resolve({
                    statusCode: 200,
                    headers: {'Content-Type': 'application/json'},
                    body: {'status': 'success'}
                });
            })
            .catch(err => {
                reject(err);
            });
        });
    }
    else {
        return common.sendError(400, 'unsupported lifecycleEvent');
    }
}

function verifyUserDB(triggerObj) {

    var Cloudant = require('@cloudant/cloudant');
    var cloudant;

    if (triggerObj.iamApiKey) {
        var dbURL = `${triggerObj.protocol}://${triggerObj.host}`;
        if (triggerObj.port) {
            dbURL += ':' + triggerObj.port;
        }
        cloudant = new Cloudant({ url: dbURL, plugins: { iamauth: { iamApiKey: triggerObj.iamApiKey, iamTokenUrl: triggerObj.iamUrl } } });
    }
    else {
        var url = `${triggerObj.protocol}://${triggerObj.user}:${triggerObj.pass}@${triggerObj.host}`;
        if (triggerObj.port) {
            url += ':' + triggerObj.port;
        }
        cloudant = Cloudant(url);
    }

    return new Promise(function(resolve, reject) {
        try {
            var userDB = cloudant.use(triggerObj.dbname);
            userDB.info(function(err, body) {
                if (!err) {
                    resolve();
                }
                else {
                    reject(common.sendError(err.statusCode, 'error connecting to database ' + triggerObj.dbname, err.message));
                }
            });
        }
        catch(err) {
            reject(common.sendError(400, 'error connecting to database ' + triggerObj.dbname, err.message));
        }

    });
}

exports.main = main;
