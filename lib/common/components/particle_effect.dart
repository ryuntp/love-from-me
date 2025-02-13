import 'dart:math';
import 'package:flutter/material.dart';

class Particle {
  late double x;
  late double y;
  late double dx;
  late double dy;
  late Color color;
  late double size;
  late double opacity;
  late double speed;

  Particle({
    required this.x,
    required this.y,
    required this.color,
    this.size = 8,
    this.opacity = 1.0,
  }) {
    final random = Random();
    // Random direction
    final angle = random.nextDouble() * 2 * pi;
    speed = random.nextDouble() * 2 + 1;
    dx = cos(angle) * speed;
    dy = sin(angle) * speed;
  }

  void update() {
    x += dx;
    y += dy;
    opacity *= 0.98; // Fade out
    size *= 0.98; // Shrink
  }
}

class ParticleEffect extends StatefulWidget {
  final Offset position;
  final Color color;
  final int numberOfParticles;
  final Duration duration;

  const ParticleEffect({
    super.key,
    required this.position,
    this.color = Colors.pink,
    this.numberOfParticles = 20,
    this.duration = const Duration(milliseconds: 1000),
  });

  @override
  State<ParticleEffect> createState() => _ParticleEffectState();
}

class _ParticleEffectState extends State<ParticleEffect>
    with SingleTickerProviderStateMixin {
  late List<Particle> particles;
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: widget.duration,
    );

    particles = List.generate(
      widget.numberOfParticles,
      (index) => Particle(
        x: widget.position.dx,
        y: widget.position.dy,
        color: widget.color,
      ),
    );

    _controller.addListener(() {
      for (var particle in particles) {
        particle.update();
      }
      setState(() {});
    });

    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size.infinite,
      painter: ParticlePainter(
        particles: particles,
        progress: _controller.value,
      ),
    );
  }
}

class ParticlePainter extends CustomPainter {
  final List<Particle> particles;
  final double progress;

  ParticlePainter({
    required this.particles,
    required this.progress,
  });

  @override
  void paint(Canvas canvas, Size size) {
    for (var particle in particles) {
      final paint = Paint()
        ..color = particle.color.withOpacity(particle.opacity * (1 - progress))
        ..style = PaintingStyle.fill;

      canvas.drawCircle(
        Offset(particle.x, particle.y),
        particle.size * (1 - progress),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(ParticlePainter oldDelegate) => true;
} 