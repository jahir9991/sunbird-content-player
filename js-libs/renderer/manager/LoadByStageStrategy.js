LoadByStageStrategy = Class.extend({
    assetMap: {},
    spriteSheetMap: {},
    commonAssets: [],
    commonAssetsLoaded: false,
    templateAssets: [],
    loaders: {},
    commonLoader: undefined,
    templateLoader: undefined,
    assetLoadTimeout: undefined,
    stageManifests: {},
    init: function(themeData, basePath) {
        //console.info('createjs.CordovaAudioPlugin.isSupported()', createjs.CordovaAudioPlugin.isSupported());
        var instance = this;
        createjs.Sound.registerPlugins([createjs.CordovaAudioPlugin, createjs.WebAudioPlugin, createjs.HTMLAudioPlugin]);
        createjs.Sound.alternateExtensions = ["mp3"];
        this.destroy();
        this.loadAppAssets();
        if (themeData.manifest.media) {
            if (!_.isArray(themeData.manifest.media)) themeData.manifest.media = [themeData.manifest.media];
        }

        themeData.manifest.media.forEach(function(media) {
            if ((media) && (media.src)) {
                media.src = (media.src.substring(0,4) == "http") ? media.src : basePath + media.src;
                if(createjs.CordovaAudioPlugin.isSupported()) { // Only supported in mobile
                    if(media.type !== 'sound' && media.type !== 'audiosprite') {
                        media.src = 'file:///' + media.src;
                    }
                }

                if (media.type == 'json') {
                    instance.commonAssets.push(_.clone(media));
                } else if(media.type == 'spritesheet') {
                    var imgId = media.id+"_image";
                    instance.commonAssets.push({"id": imgId, "src": media.src, "type": "image"});
                    media.images = [];
                    var animations = {};
                    if (media.animations) {
                        for (k in media.animations) {
                            animations[k] = JSON.parse(media.animations[k]);
                        }
                    }
                    media.animations = animations;
                    instance.spriteSheetMap[media.id] = media;
                } else {
                    if(media.type == 'audiosprite') {
                        if(!_.isArray(media.data.audioSprite)) media.data.audioSprite = [media.data.audioSprite];
                    }
                    instance.assetMap[media.id] = media;
                }
            }
        });
        var stages = themeData.stage;
        if (!_.isArray(stages)) stages = [stages];
        stages.forEach(function(stage) {
            instance.stageManifests[stage.id] = [];
            AssetManager.stageAudios[stage.id] = [];
            instance.populateAssets(stage, stage.id, stage.preload);
        });
        instance.loadCommonAssets();

        var templates = themeData.template;
        if (!_.isArray(templates)) templates = [templates];
        templates.forEach(function(template) {
            instance.populateTemplateAssets(template);
        });
        instance.loadTemplateAssets();
    },
    loadAppAssets: function() {
        var localPath = "undefined" == typeof cordova ? "": "file:///android_asset/www/";
        this.commonAssets.push({id: "goodjob_sound",src:  localPath+ "assets/sounds/goodjob.mp3"});
        this.commonAssets.push({id: "tryagain_sound",src:  localPath+ "assets/sounds/letstryagain.mp3"});
    },
    populateAssets: function(data, stageId, preload) {
        var instance = this;
        for (k in data) {
            var plugins = data[k];
            if (!_.isArray(plugins)) plugins = [plugins];
            if (PluginManager.isPlugin(k) && k == 'g') {
                plugins.forEach(function(plugin) {
                    instance.populateAssets(plugin, stageId, preload);
                });
            } else {
                plugins.forEach(function(plugin) {
                    var asset = instance.assetMap[plugin.asset];
                    if (asset) {
                        if (preload === true) {
                            instance.commonAssets.push(_.clone(asset));
                        } else {
                            instance.stageManifests[stageId].push(_.clone(asset));
                        }
                    }
                });
            }
        }
    },
    populateTemplateAssets: function(data) {
        var instance = this;
        for (k in data) {
            var plugins = data[k];
            if (!_.isArray(plugins)) plugins = [plugins];
            if (PluginManager.isPlugin(k) && k == 'g') {
                plugins.forEach(function(plugin) {
                    instance.populateTemplateAssets(plugin);
                });
            } else {
                plugins.forEach(function(plugin) {
                    var asset = instance.assetMap[plugin.asset];
                    if (asset) {
                        instance.templateAssets.push(_.clone(asset));
                    }
                });
            }
        }
    },
    getAsset: function(stageId, assetId) {
        var asset = undefined;
        if (this.loaders[stageId]) asset = this.loaders[stageId].getResult(assetId);
        if (!asset) asset = this.commonLoader.getResult(assetId);
        if (!asset) asset = this.templateLoader.getResult(assetId);
        if (!asset) asset = this.spriteSheetMap[assetId];
        if (!asset) {
            if(this.assetMap[assetId]) {
                console.error('Asset not found. Returning - ' + (this.assetMap[assetId].src));
                return this.assetMap[assetId].src;
            } else
                console.error('"' + assetId +'" Asset not found. Please check index.ecml.');
        };
        return asset;
    },
    initStage: function(stageId, nextStageId, prevStageId, cb) {
        var instance = this;
        this.loadStage(stageId, cb);
        var deleteStages = _.difference(_.keys(instance.loaders), [stageId, nextStageId, prevStageId]);
        if (deleteStages.length > 0) {
            deleteStages.forEach(function(stageId) {
                instance.destroyStage(stageId);
            })
        }
        if (nextStageId) {
            instance.loadStage(nextStageId, function() {
                var plugin = PluginManager.getPluginObject('next');
                if(plugin){
                    plugin.hide();
                    var nextContainer = PluginManager.getPluginObject('nextContainer');
                    if (nextContainer) {
                        nextContainer.hide();
                    }                    
                }
                //OverlayHtml.showNext();
            });
        } else {
            //OverlayHtml.showNext();
        }
        if (prevStageId) {
            instance.loadStage(prevStageId, function() {
                var plugin = PluginManager.getPluginObject('previous');
                if(plugin){
                    plugin.hide();
                    var previousContainer = PluginManager.getPluginObject('previousContainer');
                    if (previousContainer) {
                        previousContainer.hide();
                    }
                }
                //OverlayHtml.showPrevious();
                //enablePrevious();
            });
        }
        instance.loaders = _.pick(instance.loaders, stageId, nextStageId, prevStageId);
    },
    loadStage: function(stageId, cb) {
        console.log("Common assets loaded: ", this.commonLoader.loaded, " stageId: ", stageId );     
        this.waitToLoadAssets(stageId, cb);
    },
    waitToLoadAssets: function(stageId, cb){
        //Wait till all common assets get loaded
        var instance = this;
        if(this.commonAssetsLoaded){
            //Assets loaded, start stage rendering now
            instance.loadStageNow(stageId, cb);
            return;
        }
        instance.assetLoadTimeout = setTimeout(function(){
            //Assets are not yet loaded
            clearTimeout(instance.assetLoadTimeout);
            instance.waitToLoadAssets(stageId, cb);
        }, 400, instance, stageId, cb);
    },
    loadStageNow: function(stageId, cb){
        var instance = this;
        if (!instance.loaders[stageId]) {
        var manifestObj = instance.stageManifests[stageId];
        var manifestStr = JSON.stringify(manifestObj);
        if(_.isUndefined(manifestStr)){
            instance.loadStageNow(stageId, cb);
        }   

        var manifest = JSON.parse(manifestStr);
            if (_.isArray(manifest) && manifest.length > 0) {
                var loader = this._createLoader();
                loader.setMaxConnections(manifestObj.length);
                if (cb) {
                    loader.addEventListener("complete", cb);
                }
                loader.on('error', function(evt) {
                    console.error('Asset preload error', evt);
                });
                loader.installPlugin(createjs.Sound);
                loader.loadManifest(manifest, true);
                instance.loaders[stageId] = loader;
            } else {
                if (cb) {
                    cb();
                }
            }
        } else {
            if (cb) {
                cb();
            }
        }                
    },
    loadCommonAssets: function() {
        var instance = this;
        var loader = this._createLoader();
        loader.setMaxConnections(this.commonAssets.length);
        loader.installPlugin(createjs.Sound);
        loader.loadManifest(this.commonAssets, true);
        loader.on("complete", function(){
            console.log("Common assets loaded.. ");
            instance.commonAssetsLoaded = true;
        }, instance);
        this.commonLoader = loader;
    },
    loadTemplateAssets: function() {
        var loader = this._createLoader();
        loader.setMaxConnections(this.templateAssets.length);
        loader.installPlugin(createjs.Sound);
        loader.loadManifest(this.templateAssets, true);
        this.templateLoader = loader;
    },
    loadAsset: function(stageId, assetId, path, cb) {
        var loader = this.loaders[stageId];
        if (loader) {
            var itemLoaded = loader.getItem(assetId);
            /*if(itemLoaded){
                loader.remove(assetId);                
            }*/
            loader.installPlugin(createjs.Sound);
            loader.on("complete", function() {
                if(cb){
                    cb();
                }
            }, this);
            loader.loadFile({id:assetId, src: path});
        }else{
            //Image is not intianlised to load, So loading image & adding to the loaders
            loader = this._createLoader();
            var instance = this;
            loader.on("complete", function(instance, loader) {
                if(_.isUndefined(instance.loaders)){
                    instance.loaders = {};
                }
                instance.loaders[stageId] = loader;
                if(cb){
                    cb();
                }
            }, this);
            loader.loadFile({id:assetId, src: path});
        }
    },
    destroy: function() {
        var instance = this;
        for (k in instance.loaders) {
            instance.destroyStage(k);
        }
        instance.assetMap = {};
        instance.loaders = {};
        instance.stageManifests = {};
        try {
            createjs.Sound.removeAllSounds();
        } catch(err) {}
    },
    destroyStage: function(stageId) {
        if (this.loaders[stageId]) {
            this.loaders[stageId].destroy();
            AssetManager.stageAudios[stageId].forEach(function(audioAsset) {
                AudioManager.destroy(stageId, audioAsset);
            });
        }
    },
    _createLoader: function() {
        return "undefined" == typeof cordova ? new createjs.LoadQueue(true, null, true) : new createjs.LoadQueue(false);
    }
});
