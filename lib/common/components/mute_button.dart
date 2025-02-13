import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/audio_service.dart';
import '../../theme/app_colors.dart';

class MuteButton extends StatelessWidget {
  const MuteButton({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<AudioService>(
      builder: (context, audioService, child) {
        return Positioned(
          top: 16,
          right: 16,
          child: Container(
            decoration: BoxDecoration(
              color: AppColors.white.withOpacity(0.9),
              borderRadius: BorderRadius.circular(30),
              boxShadow: [
                BoxShadow(
                  color: AppColors.primaryPink.withOpacity(0.2),
                  blurRadius: 8,
                  spreadRadius: 2,
                ),
              ],
            ),
            child: IconButton(
              icon: Icon(
                audioService.isMuted ? Icons.volume_off : Icons.volume_up,
                color: AppColors.primaryPink,
              ),
              onPressed: () => audioService.toggleMute(),
              tooltip: audioService.isMuted ? 'Unmute' : 'Mute',
            ),
          ),
        );
      },
    );
  }
}
