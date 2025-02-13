import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../theme/app_colors.dart';

class HeartShapedImage extends StatelessWidget {
  final String imagePath;
  final double size;

  const HeartShapedImage({
    super.key,
    required this.imagePath,
    this.size = 200,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        boxShadow: [
          BoxShadow(
            color: AppColors.primaryPink.withOpacity(0.3),
            blurRadius: 15,
            spreadRadius: 2,
          ),
        ],
      ),
      child: ClipPath(
        clipper: HeartClipper(),
        child: Image.asset(
          imagePath,
          fit: BoxFit.cover,
        ),
      ),
    ).animate(
      onPlay: (controller) => controller.repeat(reverse: true),
    ).scale(
      duration: const Duration(seconds: 2),
      begin: const Offset(1, 1),
      end: const Offset(1.05, 1.05),
      curve: Curves.easeInOut,
    );
  }
}

class HeartClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size size) {
    Path path = Path();
    final double width = size.width;
    final double height = size.height;

    path.moveTo(0.5 * width, height * 0.35);

    // Left top curve
    path.cubicTo(
      0.2 * width,  // First control point
      0.1 * height,
      0.075 * width,  // Second control point
      0.35 * height,
      0.15 * width,  // End point
      0.45 * height,
    );

    // Left bottom curve
    path.cubicTo(
      0.25 * width,  // First control point
      0.6 * height,
      0.35 * width,  // Second control point
      0.75 * height,
      0.5 * width,  // End point
      0.9 * height,
    );

    // Right bottom curve
    path.cubicTo(
      0.65 * width,  // First control point
      0.75 * height,
      0.75 * width,  // Second control point
      0.6 * height,
      0.85 * width,  // End point
      0.45 * height,
    );

    // Right top curve
    path.cubicTo(
      0.925 * width,  // First control point
      0.35 * height,
      0.8 * width,  // Second control point
      0.1 * height,
      0.5 * width,  // End point
      0.35 * height,
    );

    path.close();
    return path;
  }

  @override
  bool shouldReclip(CustomClipper<Path> oldClipper) => false;
} 