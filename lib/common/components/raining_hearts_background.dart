import 'dart:math';
import 'package:flutter/material.dart';
import 'falling_heart.dart';

class RainingHeartsBackground extends StatelessWidget {
  final int numberOfHearts;
  
  const RainingHeartsBackground({
    super.key,
    this.numberOfHearts = 20,
  });

  @override
  Widget build(BuildContext context) {
    final random = Random();
    final screenWidth = MediaQuery.of(context).size.width;
    
    return Stack(
      children: List.generate(numberOfHearts, (index) {
        final size = random.nextDouble() * 20 + 10; // Random size between 10 and 30
        final duration = Duration(
          seconds: random.nextInt(3) + 4, // Random duration between 4 and 6 seconds
        );
        final startPosition = random.nextDouble() * screenWidth;
        
        return FallingHeart(
          key: ValueKey('heart_$index'),
          size: size,
          duration: duration,
          startPosition: startPosition,
        );
      }),
    );
  }
} 