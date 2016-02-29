'use strict';

// Load modules

const Lab = require('lab');
const Code = require('code');
const Joi = require('joi');
const Hapi = require('hapi');
const Loveboat = require('..');

// Test shortcuts

const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;
const expect = Code.expect;

const internals = {};

describe('Loveboat', () => {

    it('runs a basic transform.', (done) => {

        internals.transformRoutes({
            name: 'get-to-post',
            root: 'method',
            validate: Joi.any().valid('get'),
            handler: (val) => 'post'
        }, {
            method: 'get',
            path: '/',
            handler: internals.boringHandler
        }, (server) => {

            const table = server.table()[0].table;

            expect(table).to.be.an.array();
            expect(table).to.have.length(1);
            expect(table[0].method).to.equal('post');
            expect(table[0].path).to.equal('/');

            done();
        });

    });

    it('runs a multi-output transform.', (done) => {


        internals.transformRoutes({
            name: 'multi-path',
            root: 'path',
            validate: Joi.array(),
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
                            validate: Joi.any(),
                            handler: (val) => val
                        }, {
                            name: 'bad-two',
                            root: 'a.b',
                            validate: Joi.any(),
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

    reply('OK');
};
