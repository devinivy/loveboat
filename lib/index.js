'use strict';

const Hoek = require('hoek');
const Joi = require('joi');
const Topo = require('topo');
const Package = require('../package.json');

const internals = {};

module.exports = function (server, options, next) {

    if (!server.routeTransforms) {
        server.decorate('server', 'routeTransforms', internals.routeTransforms);
    }

    if (!server.loveboat) {
        server.decorate('server', 'loveboat', internals.loveboat);
    }

    // Record any transforms passed, associate with server root
    server.root.routeTransforms(options.transforms);

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
            refinedRoutes.push(internals.applyTransform(transform, route, this));
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
            group: newTransform.transform.name,
            before: (newTransform.before).concat(newTransform.transform.before),
            after: (newTransform.after).concat(newTransform.transform.after)
        });
    }

    return existing.nodes;
};

internals.transformSchema = Joi.object({
    transform: Joi.object({
        name: Joi.string().required(),
        before: Joi.array().items(Joi.string()).single().default([]),
        after: Joi.array().items(Joi.string()).single().default([]),
        root: Joi.string().required().allow(null),
        match: Joi.alternatives(Joi.object(), Joi.func()).required(),
        joi: Joi.object(),
        handler: Joi.func().required()
    }),
    options: Joi.object(),
    before: Joi.array().items(Joi.string()).single().default([]),
    after: Joi.array().items(Joi.string()).single().default([])
});

internals.validateTransform = function (newTransform, existingTransforms) {

    if (!newTransform.transform) {
        newTransform = {
            transform: newTransform
        };
    }

    const result = Joi.validate(newTransform, internals.transformSchema);
    Hoek.assert(!result.error, result.error && result.error.annotate());

    // Possibly converted entries, i.e. string to [string]
    newTransform = result.value;

    const newBefore = (newTransform.before).concat(newTransform.transform.before);
    const newAfter = (newTransform.after).concat(newTransform.transform.after);

    for (let i = 0; i < existingTransforms.length; ++i) {

        const existingTransform = existingTransforms[i];

        const existingBefore = (existingTransform.before).concat(existingTransform.transform.before);
        const existingAfter = (existingTransform.after).concat(existingTransform.transform.after);

        // If there are no precedence rules specified concerning two
        // transforms, then they must be mutually exclusive with
        // respect to the piece of config they manipulate.

        if (existingBefore.indexOf(newTransform.transform.name) === -1 &&
            newBefore.indexOf(existingTransform.transform.name) === -1 &&
            existingAfter.indexOf(newTransform.transform.name) === -1 &&
            newAfter.indexOf(existingTransform.transform.name) === -1) {

            const newRoot = newTransform.transform.root || '';
            const existingRoot = existingTransform.transform.root || '';

            Hoek.assert(newRoot.indexOf(existingRoot) !== 0 &&
                        existingRoot.indexOf(newRoot) !== 0,
                        newTransform.transform.name, 'conflicts with root of', existingTransform.transform.name);
        }
    }

    return newTransform;
};

internals.applyTransform = function (transformObj, route, server) {

    const transform = transformObj.transform;

    const preValue = Hoek.reach(route, transform.root);
    const result = internals.matchRoot(transform.match, transform.joi, preValue, route);

    // If the root value doesn't match the transform, pass over the route untouched
    if (result.error) {
        return route;
    }

    // Run the transformation, normalize for one route becoming many routes
    const postValues = [].concat(transform.handler(result.value, route, server, transformObj.options));

    // Return the transformed route definitions
    return postValues.map((postValue) => {

        // Operating on the whole route definition, pass through
        if (transform.root === null) {
            return postValue;
        }

        // Patch a copy of the route at the transform's root, cloning minimally.
        const postRoute = internals.minClone(route, transform.root);
        internals.setDeep(postRoute, transform.root, postValue);

        return postRoute;
    });
};

// Validate the root value against a transform's validation
internals.matchRoot = function (match, options, preValue, route) {

    if (typeof match !== 'function') {
        return Joi.validate(preValue, match, options);
    }

    return match(preValue, route);
};

// Adapted from hoek's internals.reachSet()
internals.setDeep = function (obj, key, value) {

    const path = key.split('.');
    let ref = obj;
    for (let i = 0; i < path.length; ++i) {
        const segment = path[i];
        if (i + 1 === path.length) {
            ref[segment] = value;
        }
        else if (typeof ref[segment] === 'undefined') {
            ref[segment] = {};
        }
        ref = ref[segment];
    }
};

internals.minClone = function (obj, key) {

    const newObj = internals.shallowSafe(obj);

    // E.g. config.auth.access.scope -> [config, auth, access, scope]
    //     -> [config, auth, access] -> [access, auth, config]

    const path = key.split('.');
    path.pop();
    path.reverse();

    let deepObj = newObj;

    // No need to check null as object–
    // this clone is only to be used on keys that point to objects or undefined
    while (path.length && typeof deepObj === 'object') {
        const pathItem = path.pop();
        deepObj[pathItem] = internals.shallowSafe(deepObj[pathItem]);
        deepObj = deepObj[pathItem];
    }

    return newObj;
};

// Only shallow clone if it's an object
internals.shallowSafe = function (thing) {

    if (typeof thing === 'object' && thing !== null) {
        return Hoek.shallow(thing);
    }

    return thing;
};
