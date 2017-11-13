# loveboat

the hapi route config preprocessor

[![Build Status](https://travis-ci.org/devinivy/loveboat.svg?branch=master)](https://travis-ci.org/devinivy/loveboat) [![Coverage Status](https://coveralls.io/repos/devinivy/loveboat/badge.svg?branch=master&service=github)](https://coveralls.io/github/devinivy/loveboat?branch=master)

Lead Maintainer - [Devin Ivy](https://github.com/devinivy)

## Usage

Loveboat is a system for creating and registering transformations to be applied to hapi route configurations.  This can be used to make your route configurations more communicative and more expressive!

Imagine the ability to add multiple paths on a single route, define route post-requisites (in addition to pre-requisites), or have your routes give themselves tags based upon other pieces of their definition.

Loveboat transforms are defined in such a way that they cannot conflict with each other.  That is, two transformations can only act on the same portion of a route configuration if they explicitly say that they are aware of each other and have a well-defined order in which they act.  So go ahead and transform your route configurations without worry!

### Community Transforms
  - [loveboat-defaults](https://github.com/devinivy/loveboat-defaults) - add support for per-plugin route defaults.

  - [loveboat-nested-scopes](https://github.com/devinivy/loveboat-nested-scopes) - add support for hierarchical auth scopes.

  - [loveboat-paths](https://github.com/devinivy/loveboat-paths) - add support for multiple paths on a single route.

  - [loveboat-postreqs](https://github.com/devinivy/loveboat-postreqs) - add support for route post-requisites.

### Example
Here's a long-form example using a custom transform,
```js
const Hapi = require('hapi');
const Joi = require('joi');
const Loveboat = require('loveboat');

const server = new Hapi.Server();
server.connection();

server.register(Loveboat, (err) => {

    // Register route config transforms to use
    // specifically for this server (or plugin).
    server.routeTransforms([{
        name: 'patch-to-post',
        root: 'method',
        match: Joi.string().valid('patch'),
        handler: (method) => 'post'
    }]);

    // Transform and register routes!
    server.loveboat([
        {
            method: 'patch',  // This route definition will be transformed
            path: '/',        // to use POST rather than PATCH.
            handler: function (request, reply) {
                reply('love');
            }
        }, {
            method: 'get',    // This route definition will not be transformed
            path: '/',        // because it doesn't have a matching method.
            handler: function (request, reply) {
                reply('boat');
            }
        }
    ]);

});
```
