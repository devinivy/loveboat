'use strict';

// Load modules

const Lab = require('lab');
const Code = require('code');
const Hoek = require('hoek');
const Joi = require('joi');
const Topo = require('topo');
const Hapi = require('hapi');
const Loveboat = require('..');

// Test shortcuts

const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;
const expect = Code.expect;

const internals = {};

describe('Loveboat', () => {

    it('permits registration without transforms specified.', (done) => {

        const server = new Hapi.Server();
        server.connection();

        server.register(Loveboat, (err) => {

            expect(err).to.not.exist();
            expect(server.realm.plugins.loveboat.transforms.nodes).to.have.length(0);
            done();
        });

    });

    it('permits multiple registrations, adding specified transforms each time.', (done) => {

        const server = new Hapi.Server();
        server.connection();

        server.register({
            register: Loveboat,
            options: {
                transforms: [{
                    name: 'first',
                    root: null,
                    match: Joi.any(),
                    handler: (val) => val,
                    before: ['second']
                }]
            }
        }, (err) => {

            expect(err).to.not.exist();

            server.register({
                register: Loveboat,
                options: {
                    transforms: [{
                        name: 'second',
                        root: null,
                        match: Joi.any(),
                        handler: (val) => val
                    }]
                }
            }, (err) => {

                expect(err).to.not.exist();

                expect(server.realm.plugins.loveboat.transforms.nodes).to.have.length(2);
                done();
            });
        });

    });

    it('throws on conflicting roots.', (done) => {

        const server = new Hapi.Server();
        server.connection();

        expect(() => {

            server.register({
                register: Loveboat,
                options: {
                    transforms: [
                        {
                            name: 'bad-one',
                            root: 'a.b.c',
                            match: Joi.any(),
                            handler: (val) => val
                        }, {
                            name: 'bad-two',
                            root: 'a.b',
                            match: Joi.any(),
                            handler: (val) => val
                        }
                    ]
                }
            }, (err) => {

                done(err || new Error('Shouldn\'t make it here'));
            });

        }).to.throw('bad-two conflicts with root of bad-one');

        done();
    });

    it('throws on conflicting null roots.', (done) => {

        const server = new Hapi.Server();
        server.connection();

        expect(() => {

            server.register({
                register: Loveboat,
                options: {
                    transforms: [
                        {
                            name: 'bad-one',
                            root: null,
                            match: Joi.any(),
                            handler: (val) => val
                        }, {
                            name: 'bad-two',
                            root: null,
                            match: Joi.any(),
                            handler: (val) => val
                        }
                    ]
                }
            }, (err) => {

                done(err || new Error('Shouldn\'t make it here'));
            });

        }).to.throw('bad-two conflicts with root of bad-one');

        done();
    });

    it('allows conflicting routes that have precedence rules specified.', (done) => {

        const server = new Hapi.Server();
        server.connection();

        server.register({
            register: Loveboat,
            options: {
                transforms: [
                    {
                        name: 'one',
                        root: null,
                        match: Joi.any(),
                        handler: (val) => val,
                        before: ['four']
                    }, {
                        name: 'two',
                        root: null,
                        match: Joi.any(),
                        handler: (val) => val,
                        after: ['one', 'three']
                    }, {
                        name: 'three',
                        root: null,
                        match: Joi.any(),
                        handler: (val) => val,
                        before: ['one']
                    }, {
                        name: 'four',
                        root: null,
                        match: Joi.any(),
                        handler: (val) => val,
                        after: ['two', 'three']
                    }
                ]
            }
        }, (err) => {

            expect(err).to.not.exist();

            done();
        });
    });

    it('throws on invalid transform.', (done) => {

        const server = new Hapi.Server();
        server.connection();

        expect(() => {

            server.register({
                register: Loveboat,
                options: {
                    transforms: [
                        {
                            name: null, // Missing
                            root: 'a.b.c',
                            match: Joi.any(),
                            handler: (val) => val
                        }
                    ]
                }
            }, (err) => {

                done(err || new Error('Shouldn\'t make it here'));
            });

        }).to.throw(/"name" must be a string/);

        done();
    });

    describe('transformRoutes() decoration', () => {

        it('exists.', (done) => {

            const server = new Hapi.Server();
            server.connection();

            server.register(Loveboat, (err) => {

                expect(err).to.not.exist();
                expect(server.routeTransforms).to.be.a.function();
                done();
            });
        });

        it('registers realm-specific transforms.', (done) => {

            const server = new Hapi.Server();
            server.connection();

            const plugin = function (srv, options, next) {

                srv.routeTransforms({
                    name: 'add-one',
                    root: 'path',
                    match: Joi.any(),
                    handler: (path) => path + '1'
                });

                expect(srv.realm.plugins.loveboat.transforms.nodes).to.have.length(1);
                expect(srv.realm.plugins.loveboat.transforms.nodes[0].name).to.equal('add-one');
                expect(srv.root.realm.plugins.loveboat.transforms.nodes).to.have.length(0);

                next();
            };

            plugin.attributes = { name: 'plugin' };

            server.register([Loveboat, plugin], (err) => {

                expect(err).to.not.exist();

                done();
            });
        });

    });

    describe('loveboat() decoration', () => {

        it('exists.', (done) => {

            const server = new Hapi.Server();
            server.connection();

            server.register(Loveboat, (err) => {

                expect(err).to.not.exist();

                done();
            });
        });

        it('uses precomputed root-level transforms if no others are specified.', (done) => {

            const server = new Hapi.Server();
            server.connection();

            server.register({
                register: Loveboat,
                options: {
                    transforms: {
                        name: 'get-to-post',
                        root: 'method',
                        match: Joi.any().valid('get'),
                        handler: (method) => 'post'
                    }
                }
            }, (err) => {

                expect(err).to.not.exist();

                let addCalls = 0;
                const origAdd = Topo.prototype.add;
                Topo.prototype.add = function () {

                    addCalls++;
                    origAdd.apply(this, arguments);
                };

                server.loveboat({
                    method: 'get',
                    path: '/',
                    handler: internals.boringHandler
                });

                expect(addCalls).to.equal(0);
                Topo.prototype.add = origAdd;

                const table = server.table()[0].table;

                expect(table).to.be.an.array();
                expect(table).to.have.length(1);
                expect(table[0].method).to.equal('post');
                expect(table[0].path).to.equal('/');

                done();
            });
        });

        it('uses precomputed realm-level transforms if no others are specified.', (done) => {

            const server = new Hapi.Server();
            server.connection();

            const plugin = function (srv, options, next) {

                srv.routeTransforms({
                    name: 'get-to-post',
                    root: 'method',
                    match: Joi.any().valid('get'),
                    handler: (method) => 'post'
                });

                let addCalls = 0;
                const origAdd = Topo.prototype.add;
                Topo.prototype.add = function () {

                    addCalls++;
                    origAdd.apply(this, arguments);
                };

                srv.loveboat({
                    method: 'get',
                    path: '/',
                    handler: internals.boringHandler
                });

                expect(addCalls).to.equal(0);
                Topo.prototype.add = origAdd;

                const table = srv.table()[0].table;

                expect(table).to.be.an.array();
                expect(table).to.have.length(1);
                expect(table[0].method).to.equal('post');
                expect(table[0].path).to.equal('/');

                next();
            };

            plugin.attributes = {
                name: 'plugin'
            };

            server.register([Loveboat, plugin], (err) => {

                expect(err).to.not.exist();

                done();
            });
        });

        it('applies root, realm, and specified transforms.', (done) => {

            const server = new Hapi.Server();
            server.connection();

            const plugin = function (srv, options, next) {

                srv.routeTransforms({
                    name: 'post-to-patch',
                    root: 'method',
                    match: Joi.any().valid('post'),
                    handler: (method) => 'patch',
                    after: ['get-to-post']
                });

                srv.loveboat({
                    method: 'get',
                    path: '/',
                    handler: internals.boringHandler
                }, [
                    {
                        name: 'patch-to-put',
                        root: 'method',
                        match: Joi.any().valid('patch'),
                        handler: (method) => 'put',
                        after: ['get-to-post', 'post-to-patch']
                    }
                ]);

                const table = srv.table()[0].table;

                expect(table).to.be.an.array();
                expect(table).to.have.length(1);
                expect(table[0].method).to.equal('put');
                expect(table[0].path).to.equal('/');

                next();
            };

            plugin.attributes = {
                name: 'plugin'
            };

            server.register([{
                register: Loveboat,
                options: {
                    transforms: [{
                        name: 'get-to-post',
                        root: 'method',
                        match: Joi.any().valid('get'),
                        handler: (method) => 'post'
                    }]
                }
            }, plugin], (err) => {

                expect(err).to.not.exist();

                done();
            });
        });

        it('applies specified transforms.', (done) => {

            const server = new Hapi.Server();
            server.connection();

            server.register(Loveboat, (err) => {

                expect(err).to.not.exist();

                server.loveboat({
                    method: 'get',
                    path: '/',
                    handler: internals.boringHandler
                }, {
                    name: 'get-to-post',
                    root: 'method',
                    match: Joi.any().valid('get'),
                    handler: (method) => 'post'
                });

                const table = server.table()[0].table;

                expect(table).to.be.an.array();
                expect(table).to.have.length(1);
                expect(table[0].method).to.equal('post');
                expect(table[0].path).to.equal('/');

                done();
            });
        });

        it('applies only specified transforms when using `onlySpecified` option.', (done) => {

            const server = new Hapi.Server();
            server.connection();

            const plugin = function (srv, options, next) {

                srv.routeTransforms({
                    name: 'add-two',
                    root: 'path',
                    match: Joi.any(),
                    handler: (path) => path + '2',
                    after: ['add-one']
                });

                srv.loveboat({
                    method: 'get',
                    path: '/',
                    handler: internals.boringHandler
                }, [
                    {
                        name: 'add-three',
                        root: 'path',
                        match: Joi.any(),
                        handler: (path) => path + '3',
                        after: ['add-one', 'add-two']
                    }
                ], true);

                const table = srv.table()[0].table;

                expect(table).to.be.an.array();
                expect(table).to.have.length(1);
                expect(table[0].method).to.equal('get');
                expect(table[0].path).to.equal('/3');

                next();
            };

            plugin.attributes = {
                name: 'plugin'
            };

            server.register([{
                register: Loveboat,
                options: {
                    transforms: [{
                        name: 'add-one',
                        root: 'path',
                        match: Joi.any(),
                        handler: (path) => path + '1'
                    }]
                }
            }, plugin], (err) => {

                expect(err).to.not.exist();

                done();
            });
        });

        it('runs a multi-output transform.', (done) => {

            internals.transformRoutes({
                name: 'multi-path',
                root: 'path',
                match: Joi.array(),
                handler: (val) => val
            }, {
                method: 'get',
                path: ['/one', '/two'],
                handler: internals.boringHandler
            }, (server) => {

                const table = server.table()[0].table;

                expect(table).to.be.an.array();
                expect(table).to.have.length(2);
                expect(table[0].method).to.equal('get');
                expect(table[0].path).to.equal('/one');
                expect(table[1].method).to.equal('get');
                expect(table[1].path).to.equal('/two');

                done();
            });

        });

        it('runs a deep transform, possibly on a key that does not exist.', (done) => {

            internals.transformRoutes({
                name: 'set-deep',
                root: 'config.app.deep',
                match: Joi.any(),
                handler: (val) => true
            }, {
                method: 'get',
                path: '/',
                handler: internals.boringHandler,
                config: {}
            }, (server) => {

                const table = server.table()[0].table;

                expect(table).to.be.an.array();
                expect(table).to.have.length(1);
                expect(table[0].method).to.equal('get');
                expect(table[0].path).to.equal('/');
                expect(table[0].settings.app.deep).to.equal(true);

                done();
            });

        });

        it('does not touch non-matching routes (using joi schema).', (done) => {

            const server = new Hapi.Server();
            server.connection();

            server.register({
                register: Loveboat,
                options: {
                    transforms: [{
                        name: 'get-to-post',
                        root: 'method',
                        match: Joi.string().valid('get'),
                        handler: (method) => 'post'
                    }]
                }
            }, (err) => {

                expect(err).to.not.exist();

                const route = {
                    method: 'patch',
                    path: '/',
                    handler: internals.boringHandler
                };

                let called = false;
                const origRoute = server.route;
                server.route = function (routes) {

                    called = true;
                    expect(routes).to.be.an.array();
                    expect(routes).to.have.length(1);
                    expect(routes[0]).to.equal(route);

                    origRoute.apply(this, arguments);
                };

                server.loveboat(route);
                server.route = origRoute;

                expect(called).to.equal(true);

                done();
            });

        });

        it('does not touch non-matching routes (using validation function).', (done) => {

            const server = new Hapi.Server();
            server.connection();

            server.register({
                register: Loveboat,
                options: {
                    transforms: [{
                        name: 'get-to-post',
                        root: 'method',
                        match: (rootValue) => ({ error: new Error('Never matches'), value: rootValue }),
                        handler: (method) => 'post'
                    }]
                }
            }, (err) => {

                expect(err).to.not.exist();

                const route = {
                    method: 'patch',
                    path: '/',
                    handler: internals.boringHandler
                };

                let called = false;
                const origRoute = server.route;
                server.route = function (routes) {

                    called = true;
                    expect(routes).to.be.an.array();
                    expect(routes).to.have.length(1);
                    expect(routes[0]).to.equal(route);

                    origRoute.apply(this, arguments);
                };

                server.loveboat(route);
                server.route = origRoute;

                expect(called).to.equal(true);

                done();
            });

        });

        it('does not touch returned values for entire route config.', (done) => {

            const server = new Hapi.Server();
            server.connection();

            const returnedRoute = {
                method: 'get',
                path: '/',
                handler: internals.boringHandler
            };

            server.register({
                register: Loveboat,
                options: {
                    transforms: [{
                        name: 'entire-config',
                        root: null,
                        match: Joi.any(),
                        handler: (val) => returnedRoute
                    }]
                }
            }, (err) => {

                expect(err).to.not.exist();

                let called = false;
                const origRoute = server.route;
                server.route = function (routes) {

                    called = true;
                    expect(routes).to.be.an.array();
                    expect(routes).to.have.length(1);
                    expect(routes[0]).to.equal(returnedRoute);

                    origRoute.apply(this, arguments);
                };

                server.loveboat('anything');
                server.route = origRoute;

                expect(called).to.equal(true);

                done();
            });

        });

        it('performs a minimal clone of passed route config.', (done) => {

            const server = new Hapi.Server();
            server.connection();

            server.register(Loveboat, (err) => {

                expect(err).to.not.exist();

                server.routeTransforms({
                    name: 'headers-stay',
                    root: 'config.cors.headers',
                    match: Joi.array(),
                    handler: (val) => [val]
                });

                const writtenRoute = {
                    method: 'get',
                    path: '/',
                    handler: internals.boringHandler,
                    config: {
                        cors: { headers: ['one', 'two'] },
                        app: {}
                    }
                };

                const writtenRouteCopy = Hoek.clone(writtenRoute);

                let passedRoute;

                let called = false;
                const origRoute = server.route;
                server.route = function (routes) {

                    called = true;
                    expect(routes).to.be.an.array();
                    expect(routes).to.have.length(1);
                    passedRoute = routes[0];

                    origRoute.apply(this, arguments);
                };

                server.loveboat(writtenRoute);
                server.route = origRoute;

                expect(called).to.equal(true);

                expect(writtenRouteCopy).to.deep.equal(passedRoute);
                expect(writtenRoute).to.not.equal(passedRoute);
                expect(writtenRoute.config).to.not.equal(passedRoute.config);
                expect(writtenRoute.config.cors).to.not.equal(passedRoute.config.cors);
                expect(writtenRoute.handler).to.equal(passedRoute.handler);
                expect(writtenRoute.config.app).to.equal(passedRoute.config.app);

                done();
            });
        });

        it('passes (root, route, server) to transform handlers.', (done) => {

            const server = new Hapi.Server();
            server.connection();

            const plugin = function (srv, options, next) {

                const writtenRoute = {
                    method: 'post',
                    path: '/',
                    handler: internals.boringHandler
                };

                let called = false;

                srv.routeTransforms({
                    name: 'post-to-patch',
                    root: 'method',
                    match: Joi.any().valid('post'),
                    handler: (root, route, theServer) => {

                        called = true;
                        expect(root).to.equal('post');
                        expect(route).to.equal(writtenRoute);
                        expect(theServer).to.equal(srv);
                        return 'patch';
                    }
                });

                srv.loveboat(writtenRoute);

                expect(called).to.equal(true);

                next();
            };

            plugin.attributes = {
                name: 'plugin'
            };

            server.register([Loveboat, plugin], (err) => {

                expect(err).to.not.exist();

                done();
            });
        });

    });
});

internals.transformRoutes = function (transforms, routes, cb) {

    const server = new Hapi.Server();
    server.connection();
    server.register({
        register: Loveboat,
        options: { transforms }
    }, (err) => {

        expect(err).to.not.exist();

        server.loveboat(routes);
        cb(server);
    });
};

internals.boringHandler = function (request, reply) {

    reply('ok');
};
