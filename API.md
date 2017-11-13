## API

### Plugin Registration
Loveboat is a hapi plugin with the following options,

 - `transforms` - an object or array of objects where each one is either,
   - a route [transform](#transforms), or
   - an object with the following,
     - `transform` - a route [transform](#transforms).
     - `options` - options to be passed to the transform's handler when called.
     - `before` - a name or list of transform names before which this transform should be applied.
     - `after` - a name or list of transform names after which this transform should be applied.

### Decorations
Loveboat places several decorations on the hapi [Server](https://github.com/hapijs/hapi/blob/v16/API.md#server) object.

#### `server.loveboat(routes, [transforms, [onlySpecified]])`
Registers the specified `routes` passed through those transforms specified,

  1. by the optional `transforms` argument (of the same form as the `transforms` [registration option](#plugin-registration)),
  2. for the current plugin (active realm) via [`server.routeTransforms()`](#serverroutetransformstransforms), and
  3. for the entire server via loveboat's [registration options](#plugin-registration).

However, if `onlySpecified` is `true` then only `transforms` will be applied.

#### `server.routeTransforms(transforms)`
Registers a transform or list of transforms to be used specifically with the current plugin (in the active realm).  The `transforms` argument is of the same form as the `transforms` [registration option](#plugin-registration).

### Transforms
A transform specifies a piece of hapi a route configuration that it may act on, a schema that determines if it should act, and a handler that performs the transformation.  A transform may also specify whether it comes before or after other transforms.  It is an object of the form,

  - `name` - (required) a name for this transform.
  - `root` - (required) a string specifying which piece of route configuration this transform acts upon, e.g. `'config.auth.strategies'` (see [`Hoek.reach()`](https://github.com/hapijs/hoek/blob/master/API.md#reachobj-chain-options)).  If the transform acts on the entire route configuration, `null` should be passed.
  - `match` - (required) a [Joi](https://github.com/hapijs/joi) schema or a function used to determine if the configuration `root` (as described above) should be acted upon by this transform.  The piece of route configuration at `transform.root` is passed through this validation.

  When passed as a function `match` has the signature `function(root, route)` where,
   - `root` - the configuration root derived from a route configuration at `transform.root`.
   - `route` - the entire route configuration from which `root` is derived.

  The function should return an object having `error` and `value` keys identically to [`Joi.validate()`](https://github.com/hapijs/joi/blob/master/API.md#validatevalue-schema-options-callback).

  - `joi` - a list of [options](https://github.com/hapijs/joi/blob/master/API.md#validatevalue-schema-options-callback) to use with [Joi](https://github.com/hapijs/joi) when `match` is a Joi schema.
  - `consume` - a string or array of strings specifying pieces of route configuration that are consumed by this transform (see [`Hoek.reach()`](https://github.com/hapijs/hoek/blob/master/API.md#reachobj-chain-options)).  The listed paths are safely removed from the route definition prior to registering the route.  This should be utilized when the transform would like to extend the hapi route config API with properties that do not otherwise exist.
  - `handler` - (required) a function that performs a transformation on this transform's `root`.  It has signature `function(root, route, server, options)` where,
    - `root` - the configuration value derived from a route configuration at `transform.root`.
    - `route` - the entire route configuration from which `root` is derived.
    - `server` - the server onto which this `route` will be registered (possibly that of a plugin).
    - `options` - options passed during the transform's registration.

  The function should not mutate `root` or `route`.  It should return a new value for `root` or list of values for `root`.

  If a list (array) is returned, then each item represents a value for `root` in a new route configuration minimally-deep-cloned from `route`.  In that case, one route configuration would pass through the transform and multiple route configurations would result with different values at `transform.root`.

  - `before` - a name or list of transform names before which this transform should be applied.
  - `after` - a name or list of transform names after which this transform should be applied.
