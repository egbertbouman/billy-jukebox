app.controller('MainCtrl', function ($rootScope, $scope, $attrs, $interval, $uibModal, HelperService, MusicService, ApiService) {

    /* Switching radio stations */
    $scope.radios = [{id: 'd3e6f1ac9e0365f5e0685204284cda6dab51a52b',
                      title: 'Title radio 1',
                      titleshort: 'radio1'},
                     {id: '06525c208f1bc0ab47781b988d4edb62c4098dd1',
                      title: 'Title radio 2',
                      titleshort: 'radio2'},
                     {id: '0a9e17c075668830ea5ee1feb550005a5c9b1039',
                      title: 'Title radio 3',
                      titleshort: 'radio3'}];

    $scope.radio = {current: {}, previous: {}};

    $scope.toggle_radio = function() {
        console.log('Switching to radio ' + $scope.radio.current.id);

        if ($scope.radio.previous.id) {
            ApiService.unregister($scope.radio.previous.id);
        }
        ApiService.register($scope.user_name, $scope.radio.current.id);
        $scope.radio.previous.id = $scope.radio.current.id;
    }

    /* Music player */
    $scope.musicservice = MusicService;
    $scope.current_time = 0;
    $scope.current_volume = 50;

    $scope.start = function() {
        // Start music service
        MusicService.init();

        // Wait for it to load...
        $rootScope.$on('ready', function(event) {

            // Start playing
            $scope.$watch('tracks', function (new_value, old_val) {
                reload(new_value);
            }, true);
            $scope.$watch('position', function (new_value, old_val) {
                reposition(new_value[0], new_value[1]);
            }, true);

            // Periodically update status
            $interval(function() {
                var time = MusicService.get_current_time();
                $scope.current_time = time;
                $scope.current_time_str = HelperService.formatTime(time);

                time = MusicService.get_duration();
                $scope.duration = time || 1;
                $scope.duration_str = HelperService.formatTime(time);

                $scope.remaining = Math.abs($scope.current_time - $scope.duration);
                $scope.remaining_str = HelperService.formatTime($scope.remaining);
            }, 1000);
        });
    };
    $scope.$on('playing', function(event) {
        // Soundcloud seems to reset the volume after changing tracks, so we need to set the volume again.
        MusicService.set_volume($scope.current_volume);
    });
    $scope.$on('ended', function(event) {
        MusicService.next(true);
        log();
        update_track_lists();
    });
    $scope.set_volume = function(volume) {
        MusicService.set_volume(volume);
        $scope.current_volume = volume;
    };
    $scope.volume_click = function(e) {
        var width = $(e.currentTarget).width();
        var volume = (e.offsetX / width) * 100;
        $scope.set_volume(volume);
    };
    var reload = function(tracks) {
        MusicService.set_playlists({default_name: {tracks: tracks}});
        MusicService.load_and_play({name: 'default_name', index: 0});
        log();
        update_track_lists();
    };

    /* Server variables */
    $scope.tracks = ApiService.tracks;
    $scope.position = ApiService.position;
    $scope.registrations = ApiService.registrations;

    /* Clicklog */
    var log = function() {
        ApiService.post_clicklog({
            track: $scope.musicservice.track.link,
            user: $scope.user_name,
            volume: $scope.current_volume,
            radio: $scope.radio.current
        });
    };

    /* Play position synchronization */
    var playlist_position = function(index, position) {
        var pl_pos = 0;
        for (var i = 0; i < index; i++) {
            pl_pos += $scope.tracks[i].duration;
        }
        pl_pos += position;
        return pl_pos;
    };

    var reposition = function(index, position) {
        // Calculate position within the playlist for both the client and the server
        var pl_pos_srv = playlist_position(index, position);
        var pl_pos_clt = playlist_position(MusicService.index, MusicService.get_current_time());
        var timediff = Math.abs(pl_pos_clt - pl_pos_srv);
        //console.log('Time difference: ' + timediff);

        if (isNaN(timediff)) {
            // In case the player has not started yet, retry when the player is ready
            console.log('Can\'t calculate time difference right now, rescheduling');
            var unsubscribe = $rootScope.$on('playing', function(event) {
                var time_correction = (new Date().getTime() - ApiService.last_status_update) / 1000;
                reposition(index, position + time_correction);
                unsubscribe();
            });
        }
        else if (timediff >= 5) {
            console.log('Time difference is ' + timediff + 's, correcting play position');
            if (MusicService.index !== index) {
                MusicService.load_and_play({name: 'default_name', index: index});
                update_track_lists();
            }
            MusicService.seek(position);
        }
    };

    $scope.tracks_prev = [];
    $scope.tracks_next = [];
    var update_track_lists = function() {
        var counter = 0;
        var tracks_prev = [];
        while (tracks_prev.length < 3) {
            tracks_prev.unshift($scope.tracks[mod(MusicService.index - counter, $scope.tracks.length)]);
            counter++;
        }
        $scope.tracks_prev = tracks_prev;

        counter = 1;
        tracks_next = [];
        while (tracks_next.length < 3) {
            tracks_next.push($scope.tracks[mod(MusicService.index + counter, $scope.tracks.length)]);
            counter++;
        }
        $scope.tracks_next = tracks_next;
    }

    var mod = function (a, b) {
        return ((a % b) + b) % b;
    }

    var modalInstance = $uibModal.open({
        animation: false,
        templateUrl: 'app/views/registration_modal.html',
        controller: 'RegistrationModalCtrl',
        scope: $scope,
        resolve: {
            radios: function () {
                return $scope.radios;
            }
        },
        backdrop  : 'static',
        keyboard  : false
    });
    modalInstance.result.then(function success(result) {
        $.each($scope.radios, function(index, radio) {
            if (result.radio_id == radio.id) {
                $scope.radio.current = radio;
                $scope.user_name = result.name;
                $scope.toggle_radio();
                $scope.start();
                return false;
            }
        });
    }, function error() {
    });

    $scope.close_widget = function() {
        parent.postMessage('close-widget', '*');
    };

    var old_volume = $scope.current_volume;
    window.onmessage = function(event) {
        if (event.data === 'restore-volume') {
            $scope.set_volume(old_volume);
        }
        else if (event.data === 'mute-volume') {
            old_volume = $scope.current_volume;
            $scope.set_volume(0);
        }
    };

    $(window).ready(function() {
        $scope.in_iframe = window.location !== window.parent.location;
    });
});

app.controller('RegistrationModalCtrl',  function ($scope, $uibModalInstance) {
    $scope.save = function () {
        $scope.name_popover = (!$scope.registration.name);
        $scope.radio_id_popover = (!$scope.registration.radio_id);
        if (!$scope.registration.name || !$scope.registration.radio_id)
            return;

        $uibModalInstance.close($scope.registration);
    };
});
