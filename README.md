# loveboat

the hapi route config preprocessor

[![Build Status](https://travis-ci.org/devinivy/loveboat.svg?branch=master)](https://travis-ci.org/devinivy/loveboat) [![Coverage Status](https://coveralls.io/repos/devinivy/loveboat/badge.svg?branch=master&service=github)](https://coveralls.io/github/devinivy/loveboat?branch=master)

## Usage

```js
const Hapi = require('hapi');
const Joi = require('joi');
const Loveboat = require('loveboat');

const server = new Hapi.Server();
server.connection();

server.register({
    register: Loveboat,
    options: {
      transforms: [{
        name: 'patch-to-post',
        root: 'method',
        validate: Joi.string().valid('patch'),
        handler: (method) => 'post'
      }]
    }
}, (err) => {

  // This route definition will be transformed
  // to use POST rather than PATCH.
  server.loveboat({
    method: 'patch',
    path: '/',
    handler: function (request, reply) {
      reply('lovely');
    }
  });

});
```

## API

### Plugin Registration
Loveboat is a hapi plugin with the following options,

 - `transforms` - a route [transform](#transforms) or list of route transforms to be used with all route registrations via [`server.loveboat()`](#serverloveboatroutes-transforms-onlyspecified).

### Decorations
Loveboat places several decorations on the hapi [Server](https://github.com/hapijs/hapi/blob/master/API.md#server) object.

#### `server.loveboat(routes, [transforms], [onlySpecified])`
Registers the specified `routes` passed through those transforms specified,

  1. by the optional `transforms` argument,
  2. for the current plugin (active realm) via [`server.routeTransforms()`](#serverroutetransformstransforms), and
  3. for the server root via loveboat's [registration options](#regstration-options).

However, if `onlySpecified` is `true` then only `transforms` will be applied.

#### `server.routeTransforms(transforms)`
Registers a transform or list of transforms to be used specifically with the current plugin (in the active realm).

### Transforms
A transform specifies a piece of hapi a route configuration that it may act on, a schema that determines if it should act, and a handler that performs the transformation.  A transform may also specify whether it comes before or after other transforms.  It is an object of the form,

  - `name` - (required) a name for this transform.
  - `root` - (required) a string specifying which piece of route configuration this transform acts upon, e.g. `'config.auth.strategies'` (see [`Hoek.reach()`](https://github.com/hapijs/hoek#reachobj-chain-options)).  If the transform acts on the entire route configuration, `null` should be passed.
  - `validate` - (required) a [Joi](https://github.com/hapijs/joi) schema or a function used to determine if the configuration `root` (as described above) should be acted upon by this transform.  The piece of route configuration at `transform.root` is passed through this validation.

  When passed as a function `validate` has the signature `function(root, route)` where,
   - `root` - the configuration root derived from a route configuration at `transform.root`.
   - `route` - the entire route configuration from which `root` is derived.

  The function should return an object having `error` and `value` keys identically to [`Joi.validate()`](https://github.com/hapijs/joi/blob/master/API.md#validatevalue-schema-options-callback).

  - `joi` - a list of [options](https://github.com/hapijs/joi/blob/master/API.md#validatevalue-schema-options-callback) to use with [Joi](https://github.com/hapijs/joi) when `validate` is a Joi schema.
  - `handler` - (required) a function that performs a transformation on this transform's `root`.  It has signature `function(root, route)` where,
    - `root` - the configuration root derived from a route configuration at `transform.root`.
    - `route` - the entire route configuration from which `root` is derived.

  The function should not mutate `root` or `route`.  It should return a new value for `root` or list of values for `root`.

  If a list (array) is returned, then each item represents a value for `root` in a new route configuration deep-copied from `route`.  In that case, one route configuration would pass through the transform and multiple route configurations would result with different values at `transform.root`.

  - `before` - a name or list of transform names before which this transform should be applied.
  - `after` - a name or list of transform names after which this transform should be applied.
