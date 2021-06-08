const Module = require('@ijstech/module');
const Log = require('@ijstech/log');
const PathRegexp = require('path-to-regexp');
var Sites = {};
function clone(obj){
    if (obj)
        return JSON.parse(JSON.stringify(obj))
    else
        return {}
}
function parseUrl(regex, url){		
    if (url.toLowerCase() == regex.toLowerCase()){
        return {
            url: url,
            params: {}
        }
    }
    let keys = []
    let m;
    try{			
        let regexp = PathRegexp.pathToRegexp(regex, keys);			
        m = regexp.exec(url);
    }
    catch(err){
        Log.error(err)
        return;
    }	
    if (m) {        
        let params = {};
        if (keys.length > 0) {            
            let values = m.slice(1);
            for (let k = keys.length - 1; k > -1; k--) {                
                params[keys[k].name] = values[k]
            }
        } 
        let result = {
            url: url,
            params : params || {}
        }        
        return result;
    }
}
async function updateEndpoints(site, packname){
    site.package = site.package || {};
    site.routes = site.routes || {};        
    let package = site.package[packname];    
    if (package.liveUpdate || !package.loaded){
        let pack;
        let packPath;
        if (package.liveUpdate){
            pack = await Module.getPackage(packname, package);    
            if (pack){
                site.package[packname] = site.package[packname] || {
                    liveUpdate : true
                };                
            };            
        }
        else {            
            pack = Module.getLocalPackage(packname);
            if (pack){
                packPath = pack.rootPath;            
                if (pack.default){                     
                    pack = pack.default;       
                    
                    site.package[packname] = site.package[packname] || {};
                    site.package[packname].loaded = true;
                };
                if (pack._middleware){
                    site.middlewares = site.middlewares || [];
                    site.middlewares.push(pack._middleware);
                }
                if (pack._routes){
                    let routes = await pack._routes(site, package);
                    for (let m in routes){                        
                        site.routes[m] = site.routes[m] || {};
                        for (let r in routes[m]){
                            if (!site.routes[m][r])
                                site.routes[m][r] = routes[m][r]
                        }
                    }
                }
            };
        };
        if (pack){            
            let packInfo = {
                acl: clone(pack.acl),
                id: package.id,
                orgId: package.orgId,
                liveUpdate: package.liveUpdate,
                name: packname,                
                db: clone(package.db || site.db || [])
            };
            if (Array.isArray(pack.require)){
                for (let i = 0; i < pack.require.length; i ++)
                    await updateEndpoints(site, pack.require[i]);
            };
            for (let m in pack.routes){                                        
                if (typeof(pack.routes[m]) == 'string' || Array.isArray(pack.routes[m])){                
                    site.routes[m] = pack.routes[m];
                }
                else{
                    site.routes[m] = site.routes[m] || {};
                    for (let r in pack.routes[m]){
                        let route = clone(pack.routes[m][r]);                        
                        route.package = packInfo;
                        if (!package.liveUpdate)
                            route.scriptPath = Module.resolveFullPath(packPath, route.scriptPath);
                            
                        site.routes[m][r] = route;
                    };
                };
            };
            site.menus = site.menus || {};
            for (let m in pack.menus){                                                        
                site.menus[m] = clone(pack.menus[m]);
            }; 
            site.modules = site.modules || {};
            for (let m in pack.modules){
                let module = clone(pack.modules[m]);
                module.orgId = package.orgId;
                site.modules[m.toLowerCase()] = module;
            };
        };
    };
};
async function getEndpoint(ctx, site){    
    if (ctx.endpoint)
        return ctx.endpoint;

    for (let p in site.package)
        await updateEndpoints(site, p);    
    
    if (site.routes && site.routes[ctx.method]){                        
        let root = site.routes.root || '';        
        let routes = site.routes[ctx.method];
        if (routes){
            for (let v in routes){                
                let endpoint = parseUrl(root + v, ctx.path);
                if (endpoint){
                    ctx.endpoint = endpoint;
                    let route = routes[v];
                    if (!route.id && route.file){
                        let file = route.file.toLowerCase();
                        if (site.modules[file])
                            route.id = site.modules[file].id;
                    };
                    endpoint.site = site;
                    endpoint.route = route;
                    if (typeof(ctx.query) == 'object'){
                        for (let q in ctx.query)
                            endpoint.params[q] = ctx.query[q];
                    };
                    if (!route.type){
                        if (route._middleware == undefined){                        
                            let _middleware = route.middleware || [];
                            let package = route.package;
                            if (package.middleware){
                                _middleware = package.middleware['*'] || [];                    
                                if (package.middleware[ctx.method]){
                                    if (package.middleware[ctx.method]['*'])
                                        _middleware = mergeArray(_middleware, package.middleware[ctx.method]['*']);
                                    for (let m in package.middleware[ctx.method]){   
                                        if ((root + m).toLowerCase() == ctx.path.toLowerCase()){
                                            _middleware = mergeArray(_middleware, package.middleware[ctx.method][m]);
                                        };
                                        let regexp = PathRegexp.pathToRegexp(root + package.middleware[ctx.method][m]);			
                                        let match = regexp.exec(ctx.path);
                                        if (match)
                                            _middleware = mergeArray(_middleware, package.middleware[ctx.method][m]);
                                    };
                                };                   
                            };
                            route._middleware = _middleware;
                        };
                        
                        if (route._acl == undefined){
                            if (route.acl){
                                route._acl = route.acl;
                            }                            
                            else{
                                let _acl = {};
                                let package = route.package;
                                if (package.acl){
                                    _acl = package.acl['*'] || {};                    
                                    if (package.acl[ctx.method]){
                                        if (package.acl[ctx.method]['*'])
                                            _acl = package.acl[ctx.method]['*'];
                                        for (let m in package.acl[ctx.method]){   
                                            if ((root + m).toLowerCase() == ctx.path.toLowerCase()){
                                                _acl = package.acl[ctx.method][m];
                                                break;
                                            };
                                            let regexp = PathRegexp.pathToRegexp(root + package.acl[ctx.method][m]);			
                                            let match = regexp.exec(ctx.path);
                                            if (match){
                                                _acl = package.acl[ctx.method][m];
                                                break;
                                            };
                                        };
                                    };
                                };
                                route._acl = _acl;
                            };   
                        };
                        endpoint.acl = route._acl;
                        endpoint.middleware = route._middleware;
                        endpoint.require = [].concat(site.routes.require || [], routes.require || [], route.require || []);                    
                        if (route.package.liveUpdate){
                            try{                            
                                let module = await Module.getModuleScript(route.package, route);                                                                
                                route.form = module.form;
                                route.moduleName = module.moduleName;
                                route.className = module.className;
                                route.script = module.script;
                                return endpoint;
                            }
                            catch(err){
                                Log.error(err);
                            };
                        }
                        else
                            return endpoint;
                    }
                    else
                        return endpoint;
                };
            };
        };
    };
};
function getMenu(ctx, site){
    return site.menus;
}
function getSite(hostname){
    return Sites[hostname.toLowerCase()]
};
async function _middleware(ctx, next, options){    
    try{
        let site = ctx.site || getSite(ctx.hostname);
        if (site){
            if (site.cors){                
                if (site.cors.origin){
                    if (site.cors.origin == '*'){
                        ctx.set('Access-Control-Allow-Origin', ctx.get('Origin'));
                    }
                    else{
                        ctx.set('Access-Control-Allow-Origin', site.cors.origin);
                    };
                };
                if (ctx.method == 'OPTIONS'){
                    if (site.cors.allowCredentials)
                        ctx.set('Access-Control-Allow-Credentials', 'true');
                    if (ctx.get('Access-Control-Request-Headers'))
                        ctx.set('Access-Control-Allow-Headers', site.cors.allowHeaders || ctx.get('Access-Control-Request-Headers'));
                    ctx.status = 200;
                    return;
                };
            };
            ctx.site = site;            
            let endpoint = await getEndpoint(ctx, site);
            if (endpoint){                
                if (endpoint.acl && !endpoint.acl.public && ctx.session && !ctx.session.account){
                    ctx.status = 401;
                    return;
                };                
                ctx.endpoint = endpoint;
                if (endpoint.route)
                    ctx.package = endpoint.route.package;
            }            
            for (let middleware in site.middleware){
                let pack = Module.getLocalPackage(middleware);
                if (pack){
                    if (typeof(pack.middleware) == 'function'){
                        let middleNext = false;
                        await pack.middleware(ctx, function(){                                    
                            middleNext = true;
                        });                            
                        if (!middleNext)
                            return;
                    };
                };
            };                        
            await next();
        }
        else
            await next();
    }
    catch(err){            
        Log.error(err);
        ctx.body = '$exception';
    };
};
module.exports = {
    _init(options){
        Sites = {};
        for (let s in options.site){
            let site = options.site[s]
            if (typeof(site.org) == 'string' && options.org)
                site.org = options.org[site.org];
            let domains = s.split(',');
            for (let i = 0; i < domains.length; i ++){
                if (domains[i].trim())
                    Sites[domains[i].trim().toLowerCase()] = site;
            }            
        }        
        this.options = options;        
    },
    _middleware: _middleware,
    getSite: getSite,
    getMenu: getMenu,
    getEndpoint: getEndpoint    
}