import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:just_audio/just_audio.dart';

class AudioService extends ChangeNotifier {
  final AudioPlayer _player = AudioPlayer();
  bool _isMuted = false;
  bool _isInitialized = false;
  StreamSubscription<PlayerState>? _playerStateSubscription;

  bool get isMuted => _isMuted;
  bool get isInitialized => _isInitialized;

  Future<void> initialize() async {
    if (_isInitialized) return;
    
    try {
      await _player.setAsset('assets/audio/schatze-und-ehre-gott-jeden-tag_loop-180228.mp3');
      await _player.setLoopMode(LoopMode.all);
      await _player.setVolume(0.5); // Set initial volume to 50%
      
      // Set up the state listener only once during initialization
      _playerStateSubscription = _player.playerStateStream.listen((state) {
        if (state.processingState == ProcessingState.completed) {
          _player.seek(Duration.zero);
          _player.play();
        }
      });
      
      _isInitialized = true;
      notifyListeners();
    } catch (e) {
      debugPrint('Error initializing audio: $e');
      _isInitialized = false;
    }
  }

  Future<void> play() async {
    if (!_isInitialized) {
      await initialize();
    }
    try {
      await _player.play();
    } catch (e) {
      debugPrint('Error playing audio: $e');
    }
  }

  Future<void> pause() async {
    try {
      await _player.pause();
    } catch (e) {
      debugPrint('Error pausing audio: $e');
    }
  }

  void toggleMute() {
    _isMuted = !_isMuted;
    if (_isMuted) {
      _player.setVolume(0);
    } else {
      _player.setVolume(0.5); // Return to 50% volume when unmuting
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _playerStateSubscription?.cancel();
    _player.dispose();
    super.dispose();
  }
} 