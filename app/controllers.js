app.controller('MainCtrl', function ($rootScope, $scope, $attrs, $interval, $uibModal, HelperService, MusicService, ApiService) {

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
    };

    /* Server variables */
    $scope.tracks = ApiService.tracks;
    $scope.position = ApiService.position;
    $scope.registrations = ApiService.registrations;

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
            }
            MusicService.seek(position);
        }
    };

    var modalInstance = $uibModal.open({
        animation: false,
        templateUrl: 'app/views/registration_modal.html',
        controller: 'RegistrationModalCtrl',
        backdrop  : 'static',
        keyboard  : false
    });
    modalInstance.result.then(function success(result) {
        ApiService.register(result.name, result.radio_id);
        $scope.start();
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
        $scope.name_popover = (!$scope.name);
        $scope.radio_id_popover = (!$scope.radio_id);
        if (!$scope.name || !$scope.radio_id)
            return;

        $uibModalInstance.close({
            name: $scope.name,
            radio_id: $scope.radio_id
        });
    };
});
