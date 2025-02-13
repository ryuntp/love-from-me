import 'dart:math';
import 'package:flutter/material.dart';
import '../../theme/app_colors.dart';

class FallingHeart extends StatefulWidget {
  final double size;
  final Duration duration;
  final double startPosition;

  const FallingHeart({
    super.key,
    this.size = 24,
    required this.duration,
    required this.startPosition,
  });

  @override
  State<FallingHeart> createState() => _FallingHeartState();
}

class _FallingHeartState extends State<FallingHeart> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;
  late double _horizontalPosition;
  late double _rotationAngle;

  @override
  void initState() {
    super.initState();
    _horizontalPosition = widget.startPosition;
    _rotationAngle = Random().nextDouble() * 0.5 - 0.25; // Random rotation between -0.25 and 0.25 radians

    _controller = AnimationController(
      duration: widget.duration,
      vsync: this,
    );

    _animation = CurvedAnimation(
      parent: _controller,
      curve: Curves.linear,
    );

    _controller.forward();
    _controller.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        if (mounted) {
          _controller.reset();
          _controller.forward();
        }
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _animation,
      builder: (context, child) {
        return Positioned(
          left: _horizontalPosition,
          top: -widget.size + (MediaQuery.of(context).size.height + widget.size) * _animation.value,
          child: Transform.rotate(
            angle: _rotationAngle * sin(_animation.value * 4 * pi),
            child: Icon(
              Icons.favorite,
              color: AppColors.primaryPink.withOpacity(0.3),
              size: widget.size,
            ),
          ),
        );
      },
    );
  }
} 