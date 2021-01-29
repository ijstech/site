module.exports = {
    _init(options){        
        this.site = {};
        for (let s in options.site){
            let site = options.site[s]
            if (typeof(site.org) == 'string' && options.org)
                site.org = options.org[site.org];
            let domains = s.split(',');
            for (let i = 0; i < domains.length; i ++){
                if (domains[i].trim())
                    this.site[domains[i].trim().toLowerCase()] = site;
            }            
        }
        this.options = options;        
    },
    getSite: function(domain){
        try{
            return this.site[domain.toLowerCase()]
        }
        catch(err){

        }
    }
}