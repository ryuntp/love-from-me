import 'package:flutter/material.dart';
import '../../theme/app_colors.dart';

class LoadingTransition extends StatelessWidget {
  final Widget child;
  final bool isLoading;

  const LoadingTransition({
    super.key,
    required this.child,
    this.isLoading = false,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        // Main content
        child,

        // Loading overlay
        if (isLoading)
          AnimatedOpacity(
            opacity: isLoading ? 1.0 : 0.0,
            duration: const Duration(milliseconds: 500),
            child: Container(
              color: AppColors.primaryPink.withOpacity(0.9),
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const SizedBox(
                      width: 50,
                      height: 50,
                      child: CircularProgressIndicator(
                        valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                        strokeWidth: 3,
                      ),
                    ),
                    const SizedBox(height: 20),
                    _buildPulsingHeart(),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildPulsingHeart() {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 1.0, end: 1.3),
      duration: const Duration(milliseconds: 800),
      builder: (context, value, child) {
        return Transform.scale(
          scale: value,
          child: const Icon(
            Icons.favorite,
            color: Colors.white,
            size: 40,
          ),
        );
      },
      onEnd: () {},
    );
  }
} 