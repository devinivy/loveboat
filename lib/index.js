'use strict';

const Hoek = require('hoek');
const Joi = require('joi');
const Topo = require('topo');
const Package = require('../package.json');

const internals = {};

module.exports = function (server, options, next) {

    // Set any passed
    internals.routeTransforms.bind(server.root)(options.transforms);

    if (!server.routeTransforms) {
        server.decorate('server', 'routeTransforms', internals.routeTransforms);
    }

    if (!server.loveboat) {
        server.decorate('server', 'loveboat', internals.loveboat);
    }

    next();
};

module.exports.attributes = {
    pkg: Package,
    multiple: true
};

internals.loveboat = function (routes, transforms, onlySpecified) {

    routes = [].concat(routes);
    transforms = [].concat(transforms || []);

    const root = Hoek.reach(this.root.realm.plugins, 'loveboat.transforms.nodes', { default: [] });
    const mine = (this.root === this) ? [] : Hoek.reach(this.realm.plugins, 'loveboat.transforms.nodes', { default: [] });

    // Use root or current plugin's transforms on their own if possible,
    // otherwise merge them into explicitly passed transforms.

    if (onlySpecified) {
        transforms = internals.addTransforms(new Topo(), transforms);
    }
    else if (root.length && !mine.length && !transforms.length) {
        transforms = root;
    }
    else if (!root.length && mine.length && !transforms.length) {
        transforms = mine;
    }
    else {
        transforms = internals.addTransforms(new Topo(), root.concat(mine).concat(transforms));
    }

    for (let i = 0; i < transforms.length; ++i) {
        const transform = transforms[i];
        const refinedRoutes = [];
        for (let j = 0; j < routes.length; ++j) {
            const route = routes[j];
            refinedRoutes.push(internals.applyTransform(transform, route));
        }
        routes = Hoek.flatten(refinedRoutes);
    }

    this.route(routes);
};

internals.routeTransforms = function (newTransforms) {

    const state = this.realm.plugins.loveboat = this.realm.plugins.loveboat || {};
    state.transforms = state.transforms || new Topo();

    internals.addTransforms(state.transforms, newTransforms);
};

internals.addTransforms = function (existing, transforms) {

    const newTransforms = [].concat(transforms || []);

    for (let i = 0; i < newTransforms.length; ++i) {
        const newTransform = internals.validateTransform(newTransforms[i], existing.nodes);
        existing.add(newTransform, {
            group: newTransform.name,
            before: newTransform.before,
            after: newTransform.after
        });
    }

    return existing.nodes;
};

internals.transformSchema = Joi.object({
    name: Joi.string().required(),
    before: Joi.array().items(Joi.string()).single().default([]),
    after: Joi.array().items(Joi.string()).single().default([]),
    root: Joi.string().required().allow(null),
    validate: Joi.alternatives(Joi.object(), Joi.func()).required(),
    joi: Joi.object(),
    handler: Joi.func().required()
});

internals.validateTransform = function (transform, existingTransforms) {

    const result = Joi.validate(transform, internals.transformSchema);
    Hoek.assert(!result.error, result.error && result.error.annotate());

    // Possibly converted entries, i.e. string to [string]
    transform = result.value;

    for (let i = 0; i < existingTransforms.length; ++i) {

        const existingTransform = existingTransforms[i];

        // If there are no precedence rules specified concerning two
        // transforms, then they must be mutually exclusive with
        // respect to the piece of config they manipulate.

        if (existingTransform.before.indexOf(transform.name) === -1 &&
            transform.before.indexOf(existingTransform.name) === -1 &&
            existingTransform.after.indexOf(transform.name) === -1 &&
            transform.after.indexOf(existingTransform.name) === -1) {

            const newRoot = transform.root || '';
            const existingRoot = existingTransform.root || '';

            Hoek.assert(newRoot.indexOf(existingRoot) !== 0 &&
                        existingRoot.indexOf(newRoot) !== 0,
                        transform.name, 'conflicts with root of', existingTransform.name);
        }
    }

    return transform;
};

internals.applyTransform = function (transform, route) {

    const preValue = Hoek.reach(route, transform.root);
    const result = internals.validateRoot(transform.validate, transform.joi, preValue, route);

    // If the root value doesn't match the transform, pass over the route untouched
    if (result.error) {
        return route;
    }

    // Run the transformation, normalize for one route becoming many routes
    const postValues = [].concat(transform.handler(result.value, route));

    // Return the transformed route definitions
    return postValues.map((postValue) => {

        // Operating on the whole route definition, pass through
        if (transform.root === null) {
            return postValue;
        }

        // Patch a copy of the route at the transform's root
        const postRoute = Hoek.clone(route);
        internals.setDeep(postRoute, transform.root, postValue);

        return postRoute;
    });
};

// Validate the root value against a transform's validation
internals.validateRoot = function (validate, options, preValue, route) {

    if (typeof validate !== 'function') {
        return Joi.validate(preValue, validate, options);
    }

    return validate(preValue, route);
};

// Taken from hoek's internals.reachSet()
internals.setDeep = function (obj, key, value) {

    const path = key.split('.');
    let ref = obj;
    for (let i = 0; i < path.length; ++i) {
        const segment = path[i];
        if (i + 1 === path.length) {
            ref[segment] = value;
        }
        ref = ref[segment];
    }
};
