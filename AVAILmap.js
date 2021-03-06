(function() {
    var avl = {
        version: "0.3.0-alpha"
    };

    // XHR object constructor function
    function _avlXHR(id, url, obj) {
        var self = this,
            _xhr = _getXHR();

        self.get = function(callback) {
            _xhr.get(function(error, data) {
                if (callback !== undefined) {
                    callback(error, data);
                }
            })
        }

        self.post = function(data, callback) {
            _xhr.post(JSON.stringify(data), function(error, data) {
                if (callback !== undefined) {
                    callback(error, data);
                }
            })
        }

        self.abort = function() {
            _xhr.abort();
        }

        self.delete = function() {
            delete obj[id];
        }

        self.id = function(t) {
            if (!t) {
                return id;
            } else {
                id = t;
                return self;
            }
        }

        function _getXHR() {
            return d3.xhr(url)
                .response(function(request) {
                    return JSON.parse(request.responseText);
                })
        }
    }

    // cache object constructor function
    function _TileLayerCache() {
        var cache = {};
			
		this.data = function(id, data) {
			if (data === undefined) {
				return cache[id];
			}
            cache[id] = data;
		}
    }

    function _TileLayer(URL, options) {
        var self = this,
            IDtag,
            map,
            name,
            visibility = 'visible';     // variable to track layer visibility
            
        if (typeof options !== 'undefined') {
            name = options.name || null;
        } else {
            name = null;
        }

        function _addAttributes(lst, atts) {
            var len = lst.length;
            for (i in atts) {
                if (lst.indexOf(atts[i] === -1))
                    lst.push(atts[i]);
            }
            if (len !== lst.length) {
                map.drawLayer(self);
            }
        }

        function _removeAttributes(lst, atts) {
            var len = lst.length;
            for (var i = atts.length-1; i >= 0; i--) {
                if (lst.indexOf(atts[i] !== -1))
                    lst.splice(i, 1);
            }
            if (len !== lst.length) {
                map.drawLayer(self);
            }
        }

        self.id = function(id) {
			if (id === undefined) {
				return IDtag;
			}
            IDtag = id;
        }

        self.url = function(url) {
			if (url === undefined) {
				return URL;
			}
            URL = url;
        }

        self.setMap = function(m) {
            map = m;
        }

        self.name = function(n) {
			if (n === undefined) {
				return name;
			}
            name = n;
        }

        self.getVisibility = function() {
            return visibility;
        }
        self.hide = function() {
            visibility = (visibility === 'visible' ? 'hidden' : 'visible');
            d3.selectAll('.'+IDtag).style('visibility', visibility);
        }
    }

    // tile layer constructor function
    function _VectorLayer(url, options) {
        _TileLayer.call(this, url, options);
        var self = this,
            cache = new _TileLayerCache(),
            dataType = null,// = /.([a-zA-Z]+)$/.exec(url)[1],
            drawFunc = _drawTile,
            zIndex = 0,
            tilePath,
            dataDecoder = null,
            requests = {},  // Object to store XML HTTP Requests
            hover = null,          // false or an array containing an array of pairs.
                            // Each pair uses the following scheme:
                            //      [style, attribute_key]
                            // This applies the style to all objects with the same value
                            //      from the objects' attribute_key when the object is moused over
            properties = [],     // Array of geoJSON property names.
                            // Creates classes from specified geoJSON properties.
                            // Each class is named using the following scheme:
                            //      .attribute_key-attribute_value

            styles = [],         // Array of class names.
                            // Assigns the classes to all objects on the layer.

            choros = null;         // Not implemented

        // if a data type extension is supplied at the end of the URL,
        // then retrieve that as the data type.
        var regex = /.([a-zA-Z]+)$/;
        if (regex.test(url)) {
            dataType = regex.exec(url)[1];
        }
			
        if (typeof options !== 'undefined') {
            drawFunc = options.func || _drawTile;
            properties = options.properties || [];
            styles = options.styles || [];
            choros = options.choros || false;
            zIndex = options.zIndex || 0;
            hover = options.hover || false;
            dataDecoder = options.decoder || null;
            // dataType defaults to geojson, then is set to any url extension type,
            // and finally can be overridden by setting a datatype in options
            dataType = options.dataType || (dataType || 'geojson');
        }
        // if a datadecoder was not supplied, then check dataType
        // to see if one is needed and available
        if (!dataDecoder) {
            switch(dataType) {
                case 'topojson':
                    dataDecoder = _decode_topoJSON;
                    break;
            }
        }

        if (choros) {
            for (var i in choros) {
            	if ('domain' in choros[i]) {
            		choros[i].scale = d3.scale.quantize()
            			.domain(choros[i].domain)
            			.range(choros[i].range);
            	}
            }
        }

        self.getDrawFunc = function() {
            return drawFunc;
        }
        self.setDrawFunc = function(func) {
            drawFunc = func;
        }

        self.setTilePath = function(tp) {
            tilePath = tp;
        }

        self.getZIndex = function() {
            return zIndex;
        }

        self.getHover = function() {
            return hover;
        }
        self.addHover = function(hvr) {
            _addAttributes(hover, hvr);
        }
        self.removeHover = function(hvr) {
            _removeAttributes(hover, hvr);
        }

        self.getChoros = function() {
        	return choros;
        }
        self.addChoros = function(pleths) {
            console.log('Not implemented');
        }
        self.removeChoros = function(pleths) {
            console.log('Not implemented');
        }

        self.getStyles = function() {
            return styles;
        }
        self.addStyles = function(cls) {
            _addAttributes(styles, cls);
        }
        self.removeStyles = function(cls) {
            _removeAttributes(styles, cls);
        }

        self.getProperties = function() {
            return properties;
        }
        self.addProperties = function(props) {
            _addAttributes(properties, props);
        }
        self.removeProperties = function(props) {
            _removeAttributes(properties, props);
        }

        self.abortXHR = function(id) {
            if (id in requests) {
                requests[id].abort();
                requests[id].delete();
            }
        }

        self.drawTile = function(SVG, d) {
            var id = _generateTileID(d),
                json = cache.data(id);

            if (json === undefined) {
                var URL = _makeTileURL(d, self.url()),
                    xhr = new _avlXHR(id, URL, requests);

                requests[id] = xhr;

                xhr.get(function(error, json) {
                    xhr.delete();

                    if (error) {
                        return;
                    }
                    if (dataDecoder) {
                        json = dataDecoder(json);
                    }
                    cache.data(id, json);
                    drawFunc(SVG, d, tilePath, self, json);
                });
            } else {
                drawFunc(SVG, d, tilePath, self, json);
            }
        }

        function _decode_topoJSON(data) {
            return topojson.feature(data, data.objects.vectile);
        }
    }
    _VectorLayer.prototype = Object.create(_TileLayer.prototype);
    _VectorLayer.prototype.constructor = _VectorLayer;

    function _RasterLayer(url, options) {
        _TileLayer.call(this, url, options);

        var self = this,
            DIV = null,
            zIndex = -5;

        if (options) {
            zIndex = options.zIndex || zIndex;
        }

        self.div = function(d) {
            if (arguments.length == 0) {
                return DIV;
            }
            DIV = d;
            DIV.style("z-index", zIndex);
            return self;
        }

        self.zIndex = function(z) {
            if (arguments.length == 0) {
                return zIndex;
            }
            if (z <= 0) {
                z = -5;
            } else {
                z = 5;
            }
            zIndex = z;
            if (DIV) {
                DIV.style("z-index", zIndex);
            }
            return self;
        }

        self.drawTile = function(d) {
			return _makeTileURL(d, url);
        }
    }
    _RasterLayer.prototype = Object.create(_TileLayer.prototype);
    _RasterLayer.prototype.constructor = _RasterLayer;

    function _makeTileURL(d, url) {
        url = url.replace(/{s}/, ["a", "b", "c"][(d[0]+d[1])%3]);
        url = url.replace(/{z}/, d[2]);
        url = url.replace(/{x}/, d[0]);
        url = url.replace(/{y}/, d[1]);

        return url;
    }

    function _generateTileID(d) {
        return 'tile-' + d.join('-');
    }

    function _drawTile(SVG, d, tilePath, layer, json) {
        var k = (1 << d[2]) * 256;

        var pathLayerID = layer.id();

        //var regex = /\d{4}\./;  // this is needed to patch a d3 fill problem

        tilePath.projection()
            .translate([k / 2 - d[0] * 256, k / 2 - d[1] * 256])
            .scale(k / 2 / Math.PI);

        var visibility = layer.getVisibility()/*,
			choros = layer.getChoros(),
			hover = layer.getHover()*/;

        var paths = SVG.selectAll('.'+pathLayerID)
            .data(json.features)
            .enter().append("path")
            .attr('class', function(d) {
                var cls = 'path' + ' ' + pathLayerID;

                layer.getProperties().forEach(function(prop) {
                    cls += ' ' + prop + '-' + d.properties[prop];
                });

                layer.getStyles().forEach(function(style) {
                    cls += ' ' + style;
                });
                return cls;
            })/*
            .attr("d", function(d) {
                // apply d3 fill problem patch
				var path = tilePath(d);
				if (!regex.test(path))
					return path;

            	var segments = path.split('M');
            	for (var i in segments) {
            		if (Math.abs(parseInt(segments[i])) > 256) {
            			segments.splice(i, 1);
            		}
            	}
				return segments.join('M');
			})*/
            .attr('d', tilePath)
            .style('visibility', visibility);
/*
        if (choros) {
			paths.each(function(d) {
                var path = d3.select(this);
                choros.forEach(function(chr) {
                	path.style(chr.style, chr.scale(d.properties[chr.attr]))
                });
            });
        }

        if (hover) {
            paths.each(function(d) {
                var path = d3.select(this);
                hover.forEach(function(hvr) {
                    var prop = d.properties[hvr[1]];

                    if (!prop)
                        return;

                    var tag = 'hover-' + prop.replace(/[\s]/g, '').replace(/\b\d/, '').replace(/[^\w_]/, '');

                    path.classed(tag, true)
                        .on('mouseover', function() {
                            d3.selectAll('.'+tag).classed(hvr[0], true);
                        })
                        .on('mouseout', function() {
                            d3.selectAll('.'+tag).classed(hvr[0], false);
                        });
                });
            });
        }
*/
    }

    function _Control(map, id, position) {
        var self = this;
		self.DOMel = map.append('div')
			.attr('id', id)
			.attr('class', 'control')
			.classed(position, true)
            .on('dblclick', function() {
                d3.event.stopPropagation();
            });
				
        var IDtag = '#'+id;

        self.id = function() {
            return IDtag;
        }

        self.position = function(p) {
			if (p === undefined) {
				return position;
			}
            self.DOMel.classed(position, false);
            position = p;
            self.DOMel.classed(position, true);
        }
    }

    function _InfoControl(map, projection, zoom, position) {
		_Control.call(this, map, 'info-control', position);
        var self = this;

        map.on("mousemove", _mouseMoved);

        var info = self.DOMel
            .append('div')
            .attr('id', 'info-text');

        var width = parseInt(map.style('width')),
            height = parseInt(map.style('height'));

        _mouseMoved([width/2, height/2]);

        function _mouseMoved(loc) {
            loc = loc || d3.mouse(this);
            info.text(_formatLocation(projection.invert(loc), zoom.scale()));
        }

        function _formatLocation(p, k) {
            var format = d3.format("." + Math.floor(Math.log(k) / 2 - 2) + "f");
            return (p[1] < 0 ? format(-p[1]) + "°S" : format(p[1]) + "°N") + " "
                + (p[0] < 0 ? format(-p[0]) + "°W" : format(p[0]) + "°E");
        }
    }
    _InfoControl.prototype = Object.create(_Control.prototype);
    _InfoControl.prototype.constructor = _InfoControl;

    function _ZoomControl(mapObj, map, zoom, position) {
		_Control.call(this, map, 'zoom-control', position);
        var self = this,
            width = parseInt(d3.select(mapObj.getID()).style('width')),
            height = parseInt(d3.select(mapObj.getID()).style('height'));

        var zoomButtons = self.DOMel;

        zoomButtons.append('div')
            .attr('class', 'button active bold')
            .text('+')
            .on('click', function() {
                d3.event.stopPropagation();
                _clicked(1);
            })

        zoomButtons.append('div')
            .attr('class', 'button active bold')
            .text('-')
            .on('click', function() {
                d3.event.stopPropagation();
                _clicked(-1);
            })

        function _clicked(direction) {
            var scale = 2.0,
                targetZoom = Math.round(zoom.scale() * Math.pow(scale, direction)),
                center = [width/2, height/2],
                extent = zoom.scaleExtent(),
                translate = zoom.translate(),
                translate0 = [],
                l = [],
                view = {
                    x: translate[0],
                    y: translate[1],
                    k: zoom.scale()
                };

            d3.event.preventDefault();

            if (targetZoom < extent[0] || targetZoom > extent[1]) {
                return false;
            }
            translate0 = [(center[0]-view.x)/view.k, (center[1]-view.y)/view.k];

            view.k = targetZoom;

            l = [translate0[0]*view.k+view.x, translate0[1]*view.k+view.y];

            view.x += center[0]-l[0];
            view.y += center[1]-l[1];

            zoom.scale(view.k)
                .translate([view.x, view.y]);

            mapObj.zoomMap();
        }
    }
    _ZoomControl.prototype = Object.create(_Control.prototype);
    _ZoomControl.prototype.constructor = _ZoomControl;

    function _LayerControl(mapObj, map, projection, zoom, position) {
		_Control.call(this, map, 'zoom-control', position);
        var self = this,
            layers = mapObj.getLayers().slice(),
			layerDisplayer = self.DOMel;

        _updateButtons();

        self.update = function(layer) {
        	if (layers.indexOf(layer) === -1) {
        		layers.push(layer);
				_updateButtons();
        	}
        }

        function _updateButtons() {
            var buttons = layerDisplayer
                .selectAll('div')
                .data(layers);
				
            buttons.exit().remove();

            buttons.enter().append('div')
                .attr('class', 'list active')
                .text(function(d) { return d.name(); })
                .on('click', _hide);
        }

        function _hide(d) {
            d3.event.stopPropagation();
            d.hide();
            var inactive = (d.getVisibility() === 'hidden' ? true : false);
            d3.select(this).classed('inactive', inactive);
            }
    }
    _LayerControl.prototype = Object.create(_Control.prototype);
    _LayerControl.prototype.constructor = _LayerControl;

    function _MarkerControl(mapObj, map, projection, zoom, position) {
		_Control.call(this, map, 'zoom-control', position);

    	var self = this,
            width = parseInt(map.style('width')),
            height = parseInt(map.style('height')),
    		markers = mapObj.getMarkers().slice(),
            markerController = self.DOMel;

        _updateButtons();

        self.update = function(marker) {
            var index = markers.indexOf(marker);
        	if (index === -1) {
        		markers.push(marker);
                _updateButtons();
        	} else if (index > 0) {
                markers.splice(index, 1);
                _updateButtons();
            }
        }

        function _updateButtons() {
            var buttons = markerController
                .selectAll('div')
                .data(markers);

            buttons.exit().remove();

            buttons.enter().append('div')
                .attr('class', 'list active')
                .text(function(d) { return d.name(); })
                .on('click', _zoomTo);
        }

        function _zoomTo(d) {
            d3.event.stopPropagation();
            projection
                .center(d.coords()) // temporarily set center
                .translate([width / 2, height / 2])
                .translate(projection([0, 0])) // compute appropriate translate
                .center([0, 0]); // reset

            zoom.translate(projection.translate());

            mapObj.zoomMap();
        }
    }
    _MarkerControl.prototype = Object.create(_Control.prototype);
    _MarkerControl.prototype.constructor = _MarkerControl;

    function _CustomControl(map, position) {
        _Control.call(this, map, 'avl-custom-control', position);

        var self = this,
            name = 'Custom Control';

        var customControl = self.DOMel;

        var label = customControl.append('div')
            .attr('class', 'list active');

        var callback = null;

        self.click = function(c) {
            if (c===undefined && callback) {
                return callback(self);
            } else if (c===null) {
                customControl.on('click', null);
                return callback = null;
            }
            callback = c;
            customControl.on('click', function() {
                if (d3.event.defaultPrevented) return;
                d3.event.stopPropagation();
                callback(self);
            });
            return self;
        }

        self.name = function(n) {
            if (!n) {
                return name;
            }
            name = n;
            label.text(name);
            return self;
        }
        // this function toggles the custom control on and off. If the optional boolean
        // argument is passed, then the display will be turned on if true and
        // turned off if false.
        self.toggle = function(t) {
            if (t) {
                customControl.style('display', 'block');
            } else if (t === false) {
                customControl.style('display', 'none');
            } else {
                var display = (customControl.style('display') === 'block' ? 'none' : 'block');
                customControl.style('display', display);
            }
        }
    }
    _CustomControl.prototype = Object.create(_Control.prototype);
    _CustomControl.prototype.constructor = _CustomControl;

    // main controls container constructor function
    function _Controls(mapObj, map, projection, zoom) {
        var self = this,
        	controls = {},
            customControls = {},
            customControlsIDs = 0,
			allPositions = ['top-right', 'bottom-right', 'bottom-left', 'top-left'],
            positionsUsed = {'top-right': false, 'bottom-right': false,
							 'bottom-left': false, 'top-left': false};

        self.addControl = function(type, position) {
			position = _getPosition(position);

            if (position === null) {
                return;
            }
			
            if (type === 'info' && !controls.info) {
                controls.info = new _InfoControl(map, projection, zoom, position);
            }
            else if (type === 'zoom' && !controls.zoom) {
                controls.zoom = new _ZoomControl(mapObj, map, zoom, position);
            }
            else if (type === 'layer' && !controls.layer) {
                controls.layer = new _LayerControl(mapObj, map, projection, zoom, position);
            }
            else if (type === 'marker' && !controls.marker) {
                controls.marker = new _MarkerControl(mapObj, map, projection, zoom, position);
            }
        }

        function _getPosition(pos) {
            pos = pos || 'top-right';

            var index = allPositions.indexOf(pos);

            for (var x = 0; x < 4; x++) {
                if (positionsUsed[pos]) {
                    index = (index + 1) % allPositions.length;
                    pos = allPositions[index];
                } else {
                    positionsUsed[pos] = true;
                    return pos;
                }
            }
            return null;
        }

        self.customControl = function(options) {
            var position = 'top-right',
                name = 'Custom Control ' + customControlsIDs++,
                click = null;

            if (options) {
                position = options.position || position;
                name = options.name || name;
                click = options.click || click;
            }
            position = _getPosition(position);

            var cc = new _CustomControl(map, position);
            cc.click(click);
            cc.name(name);

            customControls[name] = cc;

            return cc;
        }

        self.update = function(type, obj) {
			if (type in controls) {
				controls[type].update(obj);
			}
        }
    }

    // map marker constructor
    function _MapMarker(coords, options) {
        var self = this,
            map,            // D3 selected map to which the marker is appended

            marker,         // map marker DOM element
            baseHeight,     // base marker height
            baseWidth,      // base marker width
            height,         // current marker height
            width,          // current marker width
            top,            // marker top
            left,           // marker left

            projection,     // map projection, used to place marker using coords

            screenXY = [],
            offsetX = 0,
            offsetY = 0,
            draggable = false,  // user settable option
            dragged = false,    // flag used to track dragging

            name = null,    // name to be displayed in a marker control
            IDtag,

            minZoom = 0,            // min zoom that marker will be displayed at
            visibility = 'visible', // used to hide marker at zooms less than minZoom

            BGcolor = '#614e6c',

            click = null;   // optional function to be called when marker is clicked

        // this scale is used to resize the marker at different zooms
        var scale = d3.scale.linear()
            .range([.25, 1.0])
            .clamp(true);

        if (typeof options !== 'undefined') {
            name = options.name || name;
            draggable = options.drag || draggable;
            minZoom = options.minZoom || 0;
            BGcolor = options.BGcolor || BGcolor;
            click = options.click || click;
        }

        self.map = function(m) {
            if (m === undefined) {
                return map;
            }
            map = m;
            marker = map.append('div')
                .attr('class', 'avl-marker')
                .style('background', BGcolor);

            if (click) {
                marker.on('click', function() {
                    if (d3.event.defaultPrevented) return;
                    d3.event.stopPropagation();
                    click(self);
                });
            }

            if (draggable) {
                marker.call(d3.behavior.drag()
                    .on("dragstart", _dragstart)
                    .on("drag", _drag)
                    .on("dragend", _dragend));
            }
            baseHeight = height = parseInt(marker.style('height'));
            baseWidth = width = parseInt(marker.style('width'));
            return self;
        }

        self.projection = function(p) {
            if (!p) {
                return projection;
            }
            projection = p;
            top = projection(coords)[1]-height;
            left = projection(coords)[0]-width/2;
            return self;
        }

        self.coords = function(c) {
            if (!c) {
                return coords;
            }
            coords = c;
            self.update()
            return self;
        }

        self.name = function(n) {
            if (!n) {
        	   return name;
            }
            name = n;
            return self;
        }

        self.id = function(id) {
            if (!id) {
                return IDtag;
            }
            IDtag = id;
            return self;
        }

        self.BGcolor = function(bg) {
            if(!bg) {
                return BGcolor;
            }
            BGcolor = bg;
            marker.style('background', BGcolor);
            return self;
        }

        self.scale = function(s) {
            if (!arguments.length) {
                return scale;
            }
            scale = s;
            return self;
        }

        self.click = function(c) {
            if(c === undefined && click) {
                return click(self);
            }
            else if (c === null) {
                marker.on('click', null);
                return click = null;
            }
            click = c;
            marker.on('click', function() {
                if (d3.event.defaultPrevented) return;
                d3.event.stopPropagation();
                click(self);
            });
            return self;
        }

        self.update = function(zoom) {
            var scl = scale(zoom);

            height = baseHeight * scl;
            width = baseWidth * scl;

            marker.style('height', height+'px')
                .style('width', width+'px');

            top = projection(coords)[1]-height;
            left = projection(coords)[0]-width/2;

            marker.style('left', left+'px')
                .style('top', top+'px');

            visibility = (zoom >= minZoom ? 'visible' : 'hidden');

            marker.style('visibility', visibility);

            return self;
        }

        self.addTo = function(mapObj) {
            mapObj.addMarker(self);
            return self;
        }

        self.remove = function() {
            marker.remove();
        }
        self.removeFrom = function(mapObj) {
            mapObj.removeMarker(self);
        }

        function _dragstart() {
            d3.event.sourceEvent.stopPropagation();

            offsetX = d3.event.sourceEvent.offsetX;
            offsetY = d3.event.sourceEvent.offsetY;
        }
        function _drag() {
            dragged = true;
            marker
                .style('left', (d3.event.x-offsetX) + 'px')
                .style('top', (d3.event.y-offsetY) + 'px');
            screenXY = [(d3.event.x+width/2-offsetX), (d3.event.y+height-offsetY)];
        }
        function _dragend() {
            if (dragged) {
                coords =  projection.invert(screenXY);
                dragged = false;
            }
        }
    }

    AVLtile = function() {
        var size = [960, 500],
            scale = 256,
            translate = [size[0] / 2, size[1] / 2],
            zoomDelta = 0;

        function tile() {
            var z = Math.max(Math.log(scale) / Math.LN2 - 8, 0),
                z0 = Math.round(z + zoomDelta),
                k = Math.pow(2, z - z0 + 8),
                origin = [(translate[0] - scale / 2) / k, (translate[1] - scale / 2) / k];

            var tiles = [],
                cols = d3.range(Math.max(0, Math.floor(-origin[0])), Math.max(0, Math.ceil(size[0] / k - origin[0]))),
                rows = d3.range(Math.max(0, Math.floor(-origin[1])), Math.max(0, Math.ceil(size[1] / k - origin[1])));

            rows.forEach(function(y) {
                cols.forEach(function(x) {
                    tiles.push([x, y, z0]);
                });
            });

            tiles.translate = origin;
            tiles.scale = k;

            return tiles;
        }

        tile.size = function(_) {
            if (!arguments.length) return size;
            size = _;
            return tile;
        };

        tile.scale = function(_) {
            if (!arguments.length) return scale;
            scale = _;
            return tile;
        };

        tile.translate = function(_) {
            if (!arguments.length) return translate;
            translate = _;
            return tile;
        };

        tile.zoomDelta = function(_) {
            if (!arguments.length) return zoomDelta;
            zoomDelta = +_;
            return tile;
        };

          return tile;
    };

    // map constructor function
    function _Map(IDtag, options, cntrls) {
        var self = this,
            layers = [],
            layerIDs = 0,
            markerIDs = 0,
        	markers = [],
            currentZoom;

        var controls = null; // controls manager object

        var rasterLayer = null;

        var zoomAdjust = 8; // needed to adjust start zoom

        var minZoom = 4,
            maxZoom = 17,
            startZoom = minZoom,
            startLoc = [-73.824, 42.686], // defaults to Albany, NY
            zoomExtent;
        
        if (typeof options !== 'undefined') {
            startLoc = options.startLoc || startLoc;
            minZoom = options.minZoom || minZoom;
            maxZoom = options.maxZoom || maxZoom;
            startZoom = options.startZoom || minZoom;
        }
        maxZoom = Math.min(17, maxZoom);

        var markerScaleDomain = [minZoom, (minZoom+maxZoom)*(2/3)];

        startZoom = 1 << (startZoom + zoomAdjust);
        zoomExtent = [1 << (minZoom + zoomAdjust), 1 << (maxZoom + zoomAdjust)];

        var width = parseInt(d3.select(IDtag).style('width')),
            height = parseInt(d3.select(IDtag).style('height')),
            prefix = prefixMatch(["webkit", "ms", "Moz", "O"]);

        var mapTile = AVLtile().size([width, height]);

        var projection  = d3.geo.mercator()
            .scale(startZoom / 2 / Math.PI)
            .translate([-width / 2, -height / 2]);

        var tileProjection = d3.geo.mercator();

        var tilePath = d3.geo.path().projection(tileProjection);

        var zoom = d3.behavior.zoom()
            .scale(startZoom)
            .scaleExtent(zoomExtent)
            .translate(projection(startLoc).map(function(x) { return -x; }))
            .on("zoom", function() { self.zoomMap(); });

        var map = d3.select(IDtag)
            .attr("class", "map")
            .style("width", width + "px")
            .style("height", height + "px")
            .call(zoom);

        var layersDiv,
            rasterDiv;

        self.zoomMap = function() {
            var tiles = mapTile
                .scale(zoom.scale())
                .translate(zoom.translate())();

            // tiles[0][2] contains the current zoom
            currentZoom = tiles[0][2];

            projection
                .scale(zoom.scale() / 2 / Math.PI)
                .translate(zoom.translate());

            if (rasterDiv) {
                var rTiles = rasterDiv
                    .style(prefix + "transform", matrix3d(tiles.scale, tiles.translate))
                    .selectAll(".r-tile")
                    .data(tiles, function(d) { return d; });

                rTiles.exit().remove();

                rTiles.enter().append('img')
                    .attr("class", 'r-tile')
                    .style("left", function(d) { return d[0] * 256 + "px"; })
                    .style("top", function(d) { return d[1] * 256 + "px"; })
                    .attr('src', rasterLayer.drawTile);

            }
            if (layersDiv) {
                var vTiles = layersDiv
                    .style(prefix + "transform", matrix3d(tiles.scale, tiles.translate))
                    .selectAll(".tile")
                    .data(tiles, function(d) { return d; });

                vTiles.enter().append('svg')
                    .attr("class", 'tile')
                    .style("left", function(d) { return d[0] * 256 + "px"; })
                    .style("top", function(d) { return d[1] * 256 + "px"; })
                    .each(function(d) {
                        var SVG = d3.select(this);

                        for (i in layers) {
                            layers[i].drawTile(SVG, d);
                        }
                    });

                vTiles.exit()
                    .each(function(d) {
                        var id = _generateTileID(d), i;
                        for (i in layers) {
                            layers[i].abortXHR(id);
                        }
                    })
                    .remove();
            }

            for (var i in markers) {
                markers[i].update(currentZoom);
            }
        }

        self.drawLayer = function(layerObj) {
            var tiles = mapTile
                .scale(zoom.scale())
                .translate(zoom.translate())();

            currentZoom = tiles[0][2];

            var vTiles = layersDiv
                .style(prefix + "transform", matrix3d(tiles.scale, tiles.translate))
                .selectAll(".tile")
                .data(tiles, function(d) { return d; });

            vTiles.each(function(d) {
                    layerObj.drawTile(d3.select(this), d);
                });
        }
        self.drawRasterLayer = function() {
            var tiles = mapTile
                .scale(zoom.scale())
                .translate(zoom.translate())();

            var rTiles = rasterDiv
                .style(prefix + "transform", matrix3d(tiles.scale, tiles.translate))
                .selectAll(".r-tile")
                .data(tiles, function(d) { return d; });

            rTiles.enter().append('img')
                .attr("class", 'r-tile')
                .style("left", function(d) { return d[0] * 256 + "px"; })
                .style("top", function(d) { return d[1] * 256 + "px"; })
                .attr('src', rasterLayer.drawTile);
        }

        self.addLayer = function(layer) {
            if (layer instanceof _VectorLayer) {
                _addVectorLayer(layer);
            } else if (layer instanceof _RasterLayer) {
                _addRasterLayer(layer);
            }
            return self;
        }

        _addVectorLayer = function(layer) {
            if (typeof layer !== 'undefined') {
                layers.push(layer);

                layers.sort(function(a, b) {
                    return a.getZIndex() - b.getZIndex();
                });

                layer.id('layer-'+(layerIDs++));
                layer.setTilePath(tilePath);
                layer.setMap(self);

                if (layer.name() === null) {
                    layer.name(layer.id());
                }

                if (controls !== null) {
                	controls.update('layer', layer);
                }

                if (!layersDiv) {
                    layersDiv = map.append("div")
                        .attr('id', 'vector-layer')
                        .attr("class", "layersDiv");
                }
                if (layers.length == 1) {
                    self.zoomMap();
                } else {
                    self.drawLayer(layer);
                }
            } else {
                throw new AVAILmapException("No Layer Object argument");
            }
            return self;
        }

        _addRasterLayer = function(layer) {
            if (typeof layer !== 'undefined') {
                layer.id('layer-'+(layerIDs++));
                layer.setMap(self);

                if (layer.name() === null) {
                    layer.name(layer.id());
                }

                rasterLayer = layer;

                rasterDiv = map.append("div")
                    .attr('id', 'raster-layer')
                    .attr("class", "layersDiv");

                layer.div(rasterDiv);

                if (layers.length == 0) {
                    self.zoomMap();
                } else {
                    self.drawRasterLayer();
                }
            } else {
                throw new AVAILmapException("No Layer Object argument");
            }
            return self;
        }
        self.getLayers = function() {
            return layers;
        }

        self.addMarker = function(marker) {
            markers.push(marker);

            marker.id('marker-' + (markerIDs++));

            if (marker.name() === null) {
                marker.name(marker.id());
            }
            marker.map(map);
            marker.projection(projection);
            marker.scale().domain(markerScaleDomain);
            marker.update(currentZoom);

            if (controls !== null) {
            	controls.update('marker', marker);
            }

            return self;
        }
        self.removeMarker = function(marker) {
            var index = markers.indexOf(marker);
            if (index !== -1) {
                marker.remove();

                markers.splice(index, 1);

                for (var i in markers) {
                    markers[i].update(currentZoom);
                }
            }

            if (controls !== null) {
                controls.update('marker', marker);
            }
        }
        self.getMarkers = function() {
        	return markers;
        }

        self.getID = function() {
            return IDtag;
        }

        self.addControl = function(type, position) {
            if (controls === null) {
                controls = new _Controls(self, map, projection, zoom);
            }
            controls.addControl(type, position);
            return self;
        }
        self.customControl = function(options) {
            if (controls === null) {
                controls = new _Controls(self, map, projection, zoom);
            }
            return controls.customControl(options);
        }

        self.projection = function() {
            return projection;
        }
        self.zoom = function() {
            return zoom;
        }
        self.dimensions = function() {
            return [width, height];
        }
    }

    function matrix3d(scale, translate) {
        var k = scale / 256, r = scale % 1 ? Number : Math.round;
        return "matrix3d(" + [k, 0, 0, 0,
                              0, k, 0, 0,
                              0, 0, k, 0,
                              r(translate[0] * scale), r(translate[1] * scale), 0, 1 ] + ")";
    }

    function prefixMatch(p) {
        var i = -1, n = p.length, s = document.body.style;
        while (++i < n) if (p[i] + "Transform" in s) return "-" + p[i].toLowerCase() + "-";
        return "";
    }

    avl.MapMarker = function(coords, options) {
        if (typeof coords !== 'undefined') {
            return new _MapMarker(coords, options);
        } else {
            throw new AVAILmapException("You must specify marker coords");
        }
    }

    avl.RasterLayer = function(url, options) {
        if (typeof url !== 'undefined') {
            return new _RasterLayer(url, options);
        } else {
            throw new AVAILmapException("You must specify a layer URL");
        }
    }

    avl.VectorLayer = function(url, options) {
        if (typeof url !== 'undefined') {
            return new _VectorLayer(url, options);
        } else {
            throw new AVAILmapException("You must specify a layer URL");
        }
    }

    avl.Map = function(options) {
        var id = '#avl-map';
        if (options) {
            id = options.id || id;
        }
        if (document.getElementById(id) === null) {
            var width = Math.max(960, window.innerWidth),
                height = Math.max(500, window.innerHeight);

            d3.select('body').append('div')
                .attr('id', id.slice(1))
                .style("width", width + "px")
                .style("height", height + "px");
        }
        return new _Map(id, options);
    }

    // exception constructor
    function AVAILmapException(m) {
        this.type = 'AVAILmapException';
        this.msg = m;
        console.error(m);
    }

    this.avl = avl;
})()