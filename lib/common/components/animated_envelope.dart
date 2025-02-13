import 'dart:math';
import 'package:flutter/material.dart';
import '../../theme/app_colors.dart';
import 'sparkle_effect.dart';

class AnimatedEnvelope extends StatefulWidget {
  final VoidCallback onSwipeUp;

  const AnimatedEnvelope({
    super.key,
    required this.onSwipeUp,
  });

  @override
  State<AnimatedEnvelope> createState() => _AnimatedEnvelopeState();
}

class _AnimatedEnvelopeState extends State<AnimatedEnvelope> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _floatAnimation;
  late Animation<double> _openAnimation;
  double _rotateX = 0;
  double _rotateY = 0;
  bool _isPressed = false;
  bool _isOpening = false;
  double _dragStartY = 0;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(seconds: 2),
      vsync: this,
    );

    _floatAnimation = Tween<double>(
      begin: -5,
      end: 5,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: Curves.easeInOut,
      ),
    );

    _openAnimation = Tween<double>(
      begin: 0,
      end: 1,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.5, 1.0, curve: Curves.easeInOut),
      ),
    );

    _controller.repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onPanUpdate(DragUpdateDetails details) {
    if (!_isPressed || _isOpening) return;
    
    setState(() {
      _rotateX += details.delta.dy * 0.01;
      _rotateY += details.delta.dx * 0.01;
      
      // Clamp rotation values
      _rotateX = _rotateX.clamp(-0.5, 0.5);
      _rotateY = _rotateY.clamp(-0.5, 0.5);
    });
  }

  void _resetRotation() {
    if (_isOpening) return;
    setState(() {
      _rotateX = 0;
      _rotateY = 0;
      _isPressed = false;
    });
  }

  void _startOpenAnimation() {
    if (!_isOpening) {
      setState(() => _isOpening = true);
      _controller.stop();
      _controller.duration = const Duration(milliseconds: 800);
      _controller.forward(from: 0).then((_) {
        widget.onSwipeUp();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => setState(() => _isPressed = true),
      onTapUp: (_) => _resetRotation(),
      onTapCancel: _resetRotation,
      onVerticalDragStart: (details) {
        _dragStartY = details.globalPosition.dy;
      },
      onVerticalDragUpdate: (details) {
        final currentY = details.globalPosition.dy;
        final dragDistance = _dragStartY - currentY;
        
        // If dragged up more than 50 logical pixels, trigger the animation
        if (dragDistance > 50) {
          _startOpenAnimation();
        }
      },
      onVerticalDragEnd: (_) {
        if (!_isOpening) {
          _resetRotation();
        }
      },
      onPanUpdate: _onPanUpdate,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          return Transform(
            transform: Matrix4.identity()
              ..setEntry(3, 2, 0.001)
              ..rotateX(_rotateX)
              ..rotateY(_rotateY)
              ..translate(0.0, _isOpening ? -100.0 * _openAnimation.value : _floatAnimation.value, 0.0),
            alignment: Alignment.center,
            child: Stack(
              children: [
                // Envelope
                Container(
                  width: 200,
                  height: 150,
                  decoration: BoxDecoration(
                    color: AppColors.white,
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.shadow,
                        blurRadius: 10,
                        offset: const Offset(0, 4),
                      ),
                    ],
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        AppColors.white,
                        AppColors.secondaryPink.withOpacity(0.3),
                      ],
                    ),
                  ),
                  child: CustomPaint(
                    painter: EnvelopePainter(openProgress: _isOpening ? _openAnimation.value : 0),
                  ),
                ),
                
                // Sparkles
                if (_isPressed && !_isOpening)
                  ...List.generate(8, (index) {
                    final angle = index * (pi / 4);
                    return Positioned(
                      left: 100 + cos(angle) * 120,
                      top: 75 + sin(angle) * 120,
                      child: const SparkleEffect(),
                    );
                  }),
              ],
            ),
          );
        },
      ),
    );
  }
}

class EnvelopePainter extends CustomPainter {
  final double openProgress;

  EnvelopePainter({this.openProgress = 0});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppColors.primaryPink
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;

    // Draw envelope outline
    final path = Path()
      ..moveTo(0, 0)
      ..lineTo(size.width, 0)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();

    // Draw envelope flap with opening animation
    final flapPath = Path();
    final midX = size.width / 2;
    final midY = size.height / 2;
    
    if (openProgress == 0) {
      flapPath.moveTo(0, 0);
      flapPath.lineTo(midX, midY);
      flapPath.lineTo(size.width, 0);
    } else {
      final controlY = -size.height * openProgress;
      flapPath.moveTo(0, 0);
      flapPath.quadraticBezierTo(midX, controlY, size.width, 0);
    }

    canvas.drawPath(path, paint);
    canvas.drawPath(flapPath, paint);

    // Draw heart seal with fade out during opening
    if (openProgress < 0.5) {
      final heartPath = Path();
      final heartSize = size.width * 0.2;
      final centerX = size.width / 2;
      final centerY = size.height / 2;

      heartPath.moveTo(centerX, centerY + heartSize * 0.3);
      heartPath.cubicTo(
        centerX - heartSize, centerY - heartSize * 0.5,
        centerX - heartSize, centerY - heartSize * 1.5,
        centerX, centerY - heartSize * 0.5,
      );
      heartPath.cubicTo(
        centerX + heartSize, centerY - heartSize * 1.5,
        centerX + heartSize, centerY - heartSize * 0.5,
        centerX, centerY + heartSize * 0.3,
      );

      canvas.drawPath(
        heartPath,
        Paint()
          ..color = AppColors.primaryPink.withOpacity(1 - (openProgress * 2))
          ..style = PaintingStyle.fill,
      );
    }
  }

  @override
  bool shouldRepaint(covariant EnvelopePainter oldDelegate) => 
    oldDelegate.openProgress != openProgress;
} 