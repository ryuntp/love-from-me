import 'dart:math';
import 'package:flutter/material.dart';
import 'falling_heart.dart';

class RainingHeartsBackground extends StatelessWidget {
  final int numberOfHearts;

  const RainingHeartsBackground({
    super.key,
    this.numberOfHearts = 30,
  });

  @override
  Widget build(BuildContext context) {
    final random = Random();
    final screenWidth = MediaQuery.of(context).size.width;
    final screenHeight = MediaQuery.of(context).size.height;

    return Stack(
      children: List.generate(numberOfHearts, (index) {
        final size =
            random.nextDouble() * 25 + 8; // Random size between 8 and 33
        final duration = Duration(
          seconds:
              random.nextInt(4) + 3, // Random duration between 3 and 6 seconds
        );
        final startPosition = random.nextDouble() * (screenWidth + 100) -
            50; // Some hearts start outside screen
        final initialDelay = Duration(milliseconds: random.nextInt(3000));
        final horizontalDrift =
            random.nextDouble() * 100 - 50; // Between -50 and 50
        final initialY = random.nextDouble() * -screenHeight;

        return FallingHeart(
          key: ValueKey('heart_$index'),
          size: size,
          duration: duration,
          startPosition: startPosition,
          initialDelay: initialDelay,
          horizontalDrift: horizontalDrift,
          initialY: initialY,
        );
      }),
    );
  }
}
