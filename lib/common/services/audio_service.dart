import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:just_audio/just_audio.dart';
import 'package:flutter/material.dart';

class AudioService extends ChangeNotifier {
  final AudioPlayer _player = AudioPlayer();
  bool _isMuted = false;
  bool _isInitialized = false;
  bool _hasUserInteracted = false;
  StreamSubscription<PlayerState>? _playerStateSubscription;

  bool get isMuted => _isMuted;
  bool get isInitialized => _isInitialized;

  Future<void> initialize() async {
    if (_isInitialized) return;

    try {
      debugPrint('Initializing audio player...');
      await _player.setAsset(
          'assets/audio/schatze-und-ehre-gott-jeden-tag_loop-180228.mp3');
      await _player.setLoopMode(LoopMode.all);
      await _player.setVolume(0.5);

      _playerStateSubscription = _player.playerStateStream.listen((state) {
        debugPrint('Audio player state changed: ${state.processingState}');
        if (state.processingState == ProcessingState.completed) {
          _player.seek(Duration.zero);
          if (!_isMuted) {
            _player.play();
          }
        }
      });

      _isInitialized = true;
      notifyListeners();
    } catch (e) {
      debugPrint('Error initializing audio: $e');
      _isInitialized = false;
    }
  }

  Future<void> startBackgroundMusic() async {
    debugPrint('Starting background music...');
    if (!_isInitialized) {
      await initialize();
    }

    _hasUserInteracted = true;
    if (!_isMuted) {
      try {
        debugPrint('Attempting to play audio...');
        await _player.play().catchError((e) async {
          debugPrint('Error playing audio, trying reload: $e');
          await _player.stop();
          await _player.seek(Duration.zero);
          await Future.delayed(const Duration(milliseconds: 100));
          return _player.play();
        }).catchError((e) {
          debugPrint('Final error playing audio: $e');
          return null;
        });
      } catch (e) {
        debugPrint('Error in startBackgroundMusic: $e');
      }
    }
  }

  void toggleMute() {
    _isMuted = !_isMuted;
    if (_isMuted) {
      _player.setVolume(0);
    } else {
      _player.setVolume(0.5);
      if (_hasUserInteracted) {
        startBackgroundMusic();
      }
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
