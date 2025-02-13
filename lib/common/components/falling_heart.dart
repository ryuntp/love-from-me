import 'dart:math';
import 'package:flutter/material.dart';

class FallingHeart extends StatefulWidget {
  final double size;
  final Duration duration;
  final double startPosition;
  final Duration initialDelay;
  final double horizontalDrift;
  final double initialY;

  const FallingHeart({
    super.key,
    required this.size,
    required this.duration,
    required this.startPosition,
    this.initialDelay = const Duration(),
    this.horizontalDrift = 0,
    this.initialY = 0,
  });

  @override
  State<FallingHeart> createState() => _FallingHeartState();
}

class _FallingHeartState extends State<FallingHeart>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;
  late Animation<double> _horizontalAnimation;
  bool _isDelayComplete = false;
  double? _screenHeight;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final newScreenHeight = MediaQuery.of(context).size.height;
    if (_screenHeight != newScreenHeight) {
      _screenHeight = newScreenHeight;
      _setupAnimations();
    }
  }

  void _setupAnimations() {
    if (!mounted) return;

    _animation = Tween<double>(
      begin: widget.initialY,
      end: _screenHeight! + widget.size,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeInOut,
    ));

    _horizontalAnimation = Tween<double>(
      begin: 0,
      end: widget.horizontalDrift,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeInOut,
    ));
  }

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: widget.duration,
      vsync: this,
    );

    if (widget.initialDelay == Duration.zero) {
      _isDelayComplete = true;
      _startAnimation();
    } else {
      Future.delayed(widget.initialDelay, () {
        if (mounted) {
          setState(() {
            _isDelayComplete = true;
          });
          _startAnimation();
        }
      });
    }
  }

  void _startAnimation() {
    if (mounted && _screenHeight != null) {
      _controller.repeat();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_isDelayComplete) return const SizedBox.shrink();

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Positioned(
          left: widget.startPosition + (_horizontalAnimation.value),
          top: _animation.value,
          child: Transform.rotate(
            angle: sin(_controller.value * pi * 2) * 0.2,
            child: Icon(
              Icons.favorite,
              size: widget.size,
              color: Colors.pink.withOpacity(0.8),
            ),
          ),
        );
      },
    );
  }
}
