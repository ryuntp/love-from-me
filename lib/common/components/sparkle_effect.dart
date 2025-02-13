import 'dart:math';
import 'package:flutter/material.dart';
import '../../theme/app_colors.dart';

class SparkleEffect extends StatefulWidget {
  const SparkleEffect({super.key});

  @override
  State<SparkleEffect> createState() => _SparkleEffectState();
}

class _SparkleEffectState extends State<SparkleEffect>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  late Animation<double> _opacityAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 600),
      vsync: this,
    );

    _scaleAnimation = Tween<double>(
      begin: 0.0,
      end: 1.0,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: Curves.easeOut,
      ),
    );

    _opacityAnimation = Tween<double>(
      begin: 1.0,
      end: 0.0,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.5, 1.0, curve: Curves.easeOut),
      ),
    );

    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Transform.scale(
          scale: _scaleAnimation.value,
          child: Opacity(
            opacity: _opacityAnimation.value,
            child: CustomPaint(
              size: const Size(20, 20),
              painter: SparklePainter(),
            ),
          ),
        );
      },
    );
  }
}

class SparklePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppColors.primaryPink.withOpacity(0.8)
      ..style = PaintingStyle.fill;

    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2;

    // Draw sparkle star
    final path = Path();
    for (var i = 0; i < 8; i++) {
      final angle = i * pi / 4;
      final point = Offset(
        center.dx + cos(angle) * radius,
        center.dy + sin(angle) * radius,
      );
      final innerPoint = Offset(
        center.dx + cos(angle + pi / 8) * radius * 0.4,
        center.dy + sin(angle + pi / 8) * radius * 0.4,
      );

      if (i == 0) {
        path.moveTo(point.dx, point.dy);
      } else {
        path.lineTo(point.dx, point.dy);
      }
      path.lineTo(innerPoint.dx, innerPoint.dy);
    }
    path.close();

    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
