app.factory('YoutubePlayerFactory', function($rootScope) {

    var player = {};
    player.create = function(css_selector) {
        var self = this;

        // Load Youtube API
        $.getScript('http://www.youtube.com/iframe_api');

        $('<div id="' + css_selector + '"></div>').appendTo('body');

        // Create player
        window.onYouTubeIframeAPIReady = function() {
            self.player = new YT.Player(css_selector, {
                height      : '200',
                width       : '320',
                playerVars: {
                    'autohide':         1,
                    'autoplay':         0,
                    'controls':         0,
                    'fs':               1,
                    'disablekb':        0,
                    'modestbranding':   1,
                    'iv_load_policy':   3,
                    'rel':              0,
                    'showinfo':         0,
                    'theme':            'dark',
                    'color':            'red'
                    },
                events: {
                    'onReady': function (data) {
                        $rootScope.$broadcast('ready', data);
                    },
                    'onStateChange': function (state) {
                        switch(state.data) {
                            case -1:
                                $rootScope.$broadcast('loadstart');
                                break;
                            case 0:
                                $rootScope.$broadcast('ended');
                                break;
                            case 1:
                                $rootScope.$broadcast('playing');
                                break;
                            case 2:
                                $rootScope.$broadcast('paused');
                                break;
                            case 5:
                                $rootScope.$broadcast('loadstart');
                                break;
                            default:
                                // do nothing
                        }
                    },
                    'onError': function (error) {
                        $rootScope.$broadcast('error', error);
                    }
                }
            });
        };
    };
    player.load_and_play = function(track) {
        this.clear();
        this.player.cueVideoById(track.link.substring(8));
        this.player.playVideo();
        this.track = track;
    };
    player.play = function() {
        this.player.playVideo();
    };
    player.pause = function() {
        this.player.pauseVideo();
    };
    player.stop = function() {
        this.player.stopVideo();
        $rootScope.$broadcast('paused');
    };
    player.clear = function() {
        this.stop();
        this.player.clearVideo();
        this.track = undefined;
    };
    player.set_volume = function(value) {
        this.player.setVolume(value);
    };
    player.seek = function(value) {
        this.player.seekTo(value);
    };
    player.get_current_time = function(value) {
        return (this.player.getPlayerState() === -1) ? 0 : this.player.getCurrentTime();
    };
    player.get_duration = function(value) {
        return this.player.getDuration();
    };

    return player;
});


app.service('MusicService', function($rootScope, YoutubePlayerFactory) {

    this.init = function() {
        // Initialize player
        YoutubePlayerFactory.create('yt_player');
    };

    this.playing = false;
    this.player = YoutubePlayerFactory;

    // Playlist status
    this.playlists = {};
    this.name = undefined;
    this.index = 0;

    // Player methods
    this.load_and_play = function(params) {
        // Stop currently playing track
        if (this.track)
            this.stop();

        if (params.index !== undefined && params.name) {
            // Load track from playlist
            this.track = this.playlists[params.name].tracks[params.index];
            this.name = params.name;
            this.index = params.index;
        }
        else {
            // Load without a playlist
            this.track = params.track;
            this.name = this.index = undefined;
        }

        this.player.load_and_play(this.track);
    };
    this.play = function() {
        this.player.play();
    };
    this.pause = function() {
        this.player.pause();
    };
    this.stop = function() {
        this.player.stop();
    };
    this.seek = function(position) {
        this.player.seek(position);
    };
    this.get_current_time = function() {
        return this.player.get_current_time();
    };
    this.get_duration = function() {
        return this.player.get_duration();
    };
    this.set_volume = function(volume) {
        this.player.set_volume(volume);
        this.volume = volume;
    };

    // Playlist methods
    this.set_playlists = function(playlists) {
        this.playlists = playlists;
    };
    this.get_playlists = function() {
        return this.playlists;
    };
    this.add_playlist = function(playlist_name, playlist) {
        this.playlists[playlist_name] = playlist;
    };
    this.delete_playlist = function(playlist_name) {
        if (Object.keys(this.playlists).length > 1) {
            delete this.playlists[playlist_name];
            return true;
        }
        return false;
    };
    this.reposition = function(playlist_name, index, step) {
        var playlist = this.playlists[playlist_name].tracks;
        var item = playlist[index];
        playlist.splice(index, 1);
        playlist.splice(index - step, 0, item);
        if (this.index < index && (this.index + step) < index) {
            this.index += step;
        }
        if (this.index < index && (this.index + step) > index) {
            this.index -= step;
        }
    };
    this.next = function(wrap) {
        var next_index;
        if (wrap === true) {
            next_index = (this.index + 1) % this.playlists[this.name].tracks.length;
        }
        else {
            next_index = (this.index + 1 < this.playlists[this.name].tracks.length) ? this.index + 1 : undefined;
        }

        if (next_index !== undefined) {
            this.load_and_play({name: this.name, index: next_index});
            this.index = next_index;
        }
    };
    this.previous = function() {
        var previous_index = (this.index - 1 >= 0) ? this.index - 1 : this.playlists[this.name].tracks.length - 1;

        if (previous_index < this.playlists[this.name].tracks.length - 1) {
            this.load_and_play({name: this.name, index: previous_index});
            this.index = previous_index;
        }
    };
    this.add = function(playlist_name, track) {
        this.playlists[playlist_name].tracks.push(track);
    };
    this.remove = function(playlist_name, index) {
        this.playlists[playlist_name].tracks.splice(index, 1);
    };

    var self = this;
    $rootScope.$on('playing', function(event) {
        self.playing = true;
    });
    $rootScope.$on('paused', function(event) {
        self.playing = false;
    });
    $rootScope.$on('ended', function(event) {
        self.playing = false;
    });
});


app.service('ApiService', function($http, $websocket) {
    this.last_status_update = undefined;
    this.tracks = [];
    this.position = [0, 0];
    this.registrations = [];
    
    var self = this;
    var socket = $websocket('ws://musesync.ewi.tudelft.nl:8000/ws/radio');

    socket.onMessage(function(message) {
        var data = JSON.parse(message.data);
        console.log('Got message: ' + data.type);
        if (data.type == 'status') {
            self.last_status_update = new Date().getTime();
            angular.copy(data.position, self.position);
        }
        else if (data.type == 'data') {
            angular.copy(data.tracks, self.tracks);
            angular.copy(data.registrations, self.registrations);
        }

        else if (data.type == 'registered') {
            self.registrations.push({user_id: data.user_id,
                                     user_name: data.user_name,
                                     time: data.time});
        }
        else if (data.type == 'unregistered') {
            for (var i = 0; i < self.registrations.length; i++) {
                if (self.registrations[i].user_id == data.user_id) {
                    self.registrations.splice(i, 1);
                    break;
                }
            }
        }
    });

    this.register = function(name, radio_id) {
        socket.send(JSON.stringify({'type': 'register', 'name': name, 'radio_id': radio_id}));
    };
    this.unregister = function(radio_id) {
        socket.send(JSON.stringify({'type': 'unregister', 'radio_id': radio_id}));
    };

    // Use Billy clicklog endpoint to log clicks
    this.post_clicklog = function(data) {
        return $http.post('//musesync.ewi.tudelft.nl:8000/api/clicklog?app=billy-jukebox', data).then(function successCallback(response) {
            return response.data;
        }, null);
    };
});

app.service('HelperService', function($uibModal) {

    this.padNumber = function(number, size) {
        var s = String(number);
        while (s.length < (size || 2))
            s = "0" + s;
        return s;
    };
    this.formatTime = function(time) {
        if (time >= 60)
            return this.padNumber(Math.floor(time / 60), 2) + ':' + this.padNumber(Math.round(time % 60), 2);
        else
            return '00:' + this.padNumber(Math.round(time), 2);
    };
    this.getParameterByName = function(name) {
        name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
        var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
            results = regex.exec(location.search);
        return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
    };
    this.replaceParameter = function(url, name, value) {
        var pattern = new RegExp('\\b(' + name + '=).*?(&|$)');
        if (url.search(pattern) >= 0) {
            return url.replace(pattern, '$1' + value + '$2');
        }
        return url + (url.indexOf('?') > 0 ? '&' : '?') + name + '=' + value;
    };
    this.formatString = function() {
        var args = Array.prototype.slice.call(arguments);
        var str = args.shift();
        return str.replace(/\{(\d+)\}/g, function (m, n) { return args[n]; });
    };
    this.alert = function(message) {
        $uibModal.open({
            animation: false,
            templateUrl: 'app/views/alert_modal.html',
            controller: function($scope) {
                $scope.message = message;
            },
        });
    };

});