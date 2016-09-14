// Roadmap




function YTMap(playerDivId, player, dataSourceEndpoint, mapApiKey, onReady)
{

    // validate player is usable object
    this.player = player;
    this.playerId = playerDivId;
    this.mapDivId = 'playerMap';
    this.dataEndpoint = dataSourceEndpoint;
    this.videoCode = '';
    this.mapApiKey = mapApiKey;

    this.showSpeed = true;
    this.showElevation = false;
    this.onReady = onReady || null;
    if (typeof playerDivId == "object")
    {
        for (var opt in playerDivId)
        {
            if (!playerDivId.hasOwnProperty(opt)) continue;
            this[opt] = playerDivId[opt];
        }
    }

    // internal
    this.map = null;
    this.mapDiv = null;
    this.speedDiv = null;
    this.elevDiv = null;
    this.activeMapData = null;
    this.gps = new (new GPS()).GPS(); // TODO; fix this
    this.startPosition = null;
    this.gpsData = [];
    this.currentDataIndex = null;
    this.positionMarker = null;
    this.onPositionUpdateCallback = null;
}

YTMap.prototype.init = function()
{

    var inst = this;

    // create the map layers

    var mapScriptTag = document.createElement('script');
    mapScriptTag.src = "https://maps.googleapis.com/maps/api/js?key="+this.mapApiKey+"&callback=initMap";

    var firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(mapScriptTag, firstScriptTag);

    var mapDiv = document.createElement('div');
    mapDiv.id = this.mapDivId;

    var playerTag = document.getElementById(this.playerId);
    playerTag.parentNode.insertBefore(mapDiv, playerTag.nextSibling);

    this.mapDiv = mapDiv;

    // attach events to player

    //this.player.addEventListener('onReady', 'initMap');
    //this.player.addEventListener('onStateChange', 'playerStateChanged');

    // define event for mapinit
    window.initMap = function(event) {
        inst.initMap(event);
        if (inst.showSpeed)
        {
            inst.showSpeedWindow();
        }
        if (inst.showElevation)
        {
            inst.showElevationWindow();
        }
    };

    return inst;

};

YTMap.prototype.initMap = function(event)
{
    this.map = new google.maps.Map(document.getElementById(this.mapDivId),{ center: {lat: -34.397, lng: 150.644}, zoom: 8 });
    this.loadPlayerMapData(function(err){
        this.buildPolylineFromCurrent().setMap(this.map);
        this.positionMarker = this.createPositionMarker();
        var boundsEndIndex = this.gpsData.length-1,
            boundsEnd = { lat: this.gpsData[boundsEndIndex].position.lat, lng: this.gpsData[boundsEndIndex].position.lon };
        //this.map.setZoom(16);
        this.map.fitBounds(new google.maps.LatLngBounds(this.startPosition,boundsEnd));
        this.currentDataIndex = 0;
        this.onReady && this.onReady();
    })
};

YTMap.prototype.loadPlayerMapData = function(callback)
{


    var inst = this,
        videoCodeFind = /\?*v=([a-z0-9\-\_\+]+)/i,// get player video id
        videoIdMatches = videoCodeFind.exec(this.player.getVideoUrl());
    console.log(videoIdMatches);
    if (videoIdMatches.length)
    {
        this.videoCode = videoIdMatches[1];
        this.videoCode = this.videoCode.replace('-','_'); // JUST FOR TESTING, SHOULD BE REMOVED
        this.loadData(this.dataEndpoint+this.videoCode+'.nmea.txt',function(err,mapData){
            if (err)
            {
                console.error('Failed to fetch GPS data for video '+err,mapData);
            }
            else
            {
                inst.parseGPSData(mapData);
            }
            callback.call(inst,err,null);
        });
    }

};

YTMap.prototype.showSpeedWindow = function()
{
    this.speedDiv = document.createElement('div');
    this.speedDiv.className = 'mapSpeed';
    this.speedDiv.innerText = '0 MPH';
    this.mapDiv.parentNode.insertBefore(this.speedDiv, this.mapDiv.nextSibling);
    this.map.controls[google.maps.ControlPosition.LEFT_BOTTOM].push(this.speedDiv);
};

YTMap.prototype.setSpeedContainer = function(container)
{
    this.speedDiv = container;
    this.map.controls[google.maps.ControlPosition.LEFT_BOTTOM].push(this.speedDiv);
};

YTMap.prototype.getSpeedContainer = function(container)
{
    return this.speedDiv;
};

YTMap.prototype.playerReady = function(event)
{
    this.videoCode = event.target.getVideoEmbedCode();
};

YTMap.prototype.playerStateChanged = function(event)
{

    if (event.data == YT.PlayerState.PLAYING)
    {
        // start timer for updating map detail
        this.startPositionUpdate();
    }
    else if (event.data == YT.PlayerState.PAUSED || event.data == YT.PlayerState.BUFFERING)
    {
        this.stopPositionUpdate();
    }
    else if (event.data == YT.PlayerState.ENDED)
    {
        this.stopPositionUpdate();
    }
    else if (event.data == YT.PlayerState.CUED)
    {
    }

};

YTMap.prototype.isDataLoaded = function()
{
    return !this.activeMapData;
};

YTMap.prototype.startPositionUpdate = function()
{
    var inst = this;
    this.updatePositionInterval = setInterval(function(){ inst.updatePosition.call(inst); },500);
};

YTMap.prototype.stopPositionUpdate = function()
{
    clearInterval(this.updatePositionInterval);
};

YTMap.prototype.getMapDataForVideoTime = function(videoTime)
{

    console.log('time.. ',videoTime);
    for (var i = this.currentDataIndex+1; i < this.gpsData.length; i++)
    {
        if (this.gpsData[i].timePosition && this.gpsData[i].timePosition >= videoTime) //this.gpsData[this.currentDataIndex].timePosition >= videoTime &&
        {
            this.currentDataIndex = i;
            break;
        }
    }

    return this.gpsData[i];
};

YTMap.prototype.onPositionUpdate = function(callback)
{
    this.onPositionUpdateCallback = callback;
};

YTMap.prototype.updatePosition = function()
{
    var videoTime = this.player.getCurrentTime(),
        currentPosition = this.getMapDataForVideoTime(videoTime),
        coords = null;
    if (currentPosition.position)
    {
        coords = { lat: currentPosition.position.lat, lng: currentPosition.position.lon };
        this.positionMarker.setPosition(coords);
        if (typeof this.onPositionUpdateCallback == "function")
        {
            this.onPositionUpdateCallback(coords, currentPosition.position.speed, currentPosition.position.elevation);
        }
        else
        {
            this.showSpeed && this.updateSpeed(currentPosition.position);
            this.showElevation && this.updateElevation(currentPosition.position);
        }
    }
};

YTMap.prototype.updateSpeed = function(position)
{
    this.speedDiv.innerText = Math.round(position.speed) + ' MPH';
};

YTMap.prototype.updateElevation = function(position)
{
    this.elevDiv.innerText = Math.round(position.elevation) + ' Feet';
};

YTMap.prototype.createPositionMarker = function(startPosition)
{

    startPosition = startPosition || this.startPosition;
    return new google.maps.Marker({
        position: startPosition,
        map: this.map,
        title: ''
    });

};

YTMap.prototype.buildPolylineFromCurrent = function()
{

    var routeCoordinates = [];

    for (var i in this.gpsData)
    {
        routeCoordinates.push({ lat: this.gpsData[i].position.lat, lng: this.gpsData[i].position.lon });
    }

    return new google.maps.Polyline({
        path: routeCoordinates,
        geodesic: true,
        strokeColor: '#FF0000',
        strokeOpacity: 1.0,
        strokeWeight: 2
    });

};


YTMap.prototype.parseGPSData = function(data)
{

    var inst = this,
        dataLines = data.split('\n');

    // setup starting gps and video timing data
    var positionSentence = null,
        dataSentence = null;
    for (var i = 0; i < dataLines.length; i++)
    {

        // associate video time and map position
        dataSentence = dataLines[i];
        if (dataSentence.indexOf('$GPEMT') >= 0 && (!this.gpsData[i] || !this.gpsData[i].timePosition) && positionSentence)
        {
            this.gpsData.push({ timePosition: this.parseFrameTimeSentence(dataSentence).timePositionSeconds, position: null, rawSentence: positionSentence });
            positionSentence = null;
        }
        else if (positionSentence == null && dataSentence.indexOf('$GPEMT') < 0)
        {
            positionSentence = dataLines[i];
        }

    }

    var processPosition = 0;

    this.gps.on('data', function(parsed) {
        if (inst.startPosition == null)
        {
            // set map default position
            inst.startPosition = {lat: parsed.lat, lng: parsed.lon};  // TODO; create a gpsToGMapsLatLng method
            inst.startTime = parsed.time;
            inst.map.panTo(inst.startPosition);
        }
        inst.gpsData.map(function(value, index){
            if (value.rawSentence == parsed.raw)
            {
                delete parsed.raw;
                value.position = parsed;
            }
            return value;
        });
    });

    for (var i = 0; i < this.gpsData.length; i++)
    {
        this.gps.update(this.gpsData[i].rawSentence);
    }

    console.info(this.gpsData);
};

YTMap.prototype.parseFrameTimeSentence = function(frameTimeSentence)
{
    var parsedSentence = frameTimeSentence.split(',');
    return {
        timePositionSeconds: parsedSentence[1]/1000
    };
};

YTMap.prototype.loadData = function(dataUrl, callback)
{
    var data = '';
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function()
    {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200)
        {
            //data = JSON.parse(xmlhttp.responseText);
            callback(null,xmlhttp.responseText);
        }
        else if (xmlhttp.readyState == 4 && xmlhttp.status > 0)
        {
            callback('Error occured '+xmlhttp.status,xmlhttp.responseText);
        }
    };
    xmlhttp.open("GET", dataUrl, true);
    xmlhttp.send();
};