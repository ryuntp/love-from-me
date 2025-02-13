import 'dart:async';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_colors.dart';
import '../../common/components/heart_shaped_image.dart';
import '../poem/thai_poem_screen.dart';
import 'package:flutter_animate/flutter_animate.dart';

class DateCountScreen extends StatefulWidget {
  const DateCountScreen({super.key});

  @override
  State<DateCountScreen> createState() => _DateCountScreenState();
}

class _DateCountScreenState extends State<DateCountScreen> {
  late Timer _timer;
  final startDate = DateTime(2024, 3, 18); // March 18, 2024
  late Duration _timeDifference;

  @override
  void initState() {
    super.initState();
    _updateTimeDifference();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      _updateTimeDifference();
    });
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  void _updateTimeDifference() {
    setState(() {
      _timeDifference = DateTime.now().difference(startDate);
    });
  }

  String _formatNumber(int number) {
    return number.toString().padLeft(2, '0');
  }

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final days = _timeDifference.inDays;
    final hours = _timeDifference.inHours.remainder(24);
    final minutes = _timeDifference.inMinutes.remainder(60);
    final seconds = _timeDifference.inSeconds.remainder(60);

    return Scaffold(
      body: Stack(
        children: [
          Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: AppColors.backgroundGradient,
              ),
            ),
            child: SafeArea(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Title text
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Text(
                      "It's been almost a year we've been dating...",
                      style: GoogleFonts.dancingScript(
                        fontSize: 32,
                        color: AppColors.primaryPink,
                        fontWeight: FontWeight.bold,
                        shadows: [
                          Shadow(
                            color: AppColors.primaryPink.withOpacity(0.3),
                            offset: const Offset(2, 2),
                            blurRadius: 4,
                          ),
                        ],
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),

                  const SizedBox(height: 40),

                  // Heart-shaped image
                  const HeartShapedImage(
                    imagePath: 'assets/images/S__16597123.jpg',
                    size: 250,
                  ),

                  const SizedBox(height: 40),

                  // Time counter
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      _buildTimeUnit(days.toString(), 'DAYS'),
                      _buildDivider(),
                      _buildTimeUnit(_formatNumber(hours), 'HOURS'),
                      _buildDivider(),
                      _buildTimeUnit(_formatNumber(minutes), 'MINUTES'),
                      _buildDivider(),
                      _buildTimeUnit(_formatNumber(seconds), 'SECONDS'),
                    ],
                  ),

                  const SizedBox(height: 60),

                  // Action button
                  ElevatedButton(
                    onPressed: () {
                      Navigator.of(context).push(
                        PageRouteBuilder(
                          pageBuilder: (context, animation, secondaryAnimation) =>
                              const ThaiPoemScreen(),
                          transitionsBuilder:
                              (context, animation, secondaryAnimation, child) {
                            const begin = Offset(1.0, 0.0);
                            const end = Offset.zero;
                            const curve = Curves.easeInOutCubic;

                            var tween = Tween(begin: begin, end: end)
                                .chain(CurveTween(curve: curve));
                            var offsetAnimation = animation.drive(tween);

                            return SlideTransition(
                              position: offsetAnimation,
                              child: child,
                            );
                          },
                          transitionDuration: const Duration(milliseconds: 800),
                        ),
                      );
                    },
                    style: ElevatedButton.styleFrom(
                      padding:
                          const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                      backgroundColor: AppColors.primaryPink,
                      foregroundColor: AppColors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(30),
                      ),
                      elevation: 8,
                      shadowColor: AppColors.primaryPink.withOpacity(0.5),
                    ),
                    child: Text(
                      'มีอะไรจะบอก กดเลย',
                      style: GoogleFonts.mali(
                        fontSize: 20,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Walking Hippo Animation
          Positioned(
            bottom: -25,
            right: -100, // Start from right outside the screen
            child: Image.asset(
              'assets/images/moo-deng.gif',
              height: 100,
              width: 100,
              fit: BoxFit.contain,
            )
                .animate(
                  onComplete: (controller) {
                    controller.repeat(); // Repeat the animation
                  },
                )
                .moveX(
                  duration: 10.seconds,
                  begin: 0,
                  end: -(screenWidth + 200), // Move beyond screen width
                  curve: Curves.linear,
                ),
          ),
        ],
      ),
    );
  }

  Widget _buildTimeUnit(String value, String label) {
    return Container(
      width: 80,
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(16),
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
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            value,
            style: GoogleFonts.quicksand(
              fontSize: 28,
              fontWeight: FontWeight.bold,
              color: AppColors.primaryPink,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: GoogleFonts.quicksand(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: AppColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDivider() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Text(
        ':',
        style: TextStyle(
          fontSize: 32,
          fontWeight: FontWeight.bold,
          color: AppColors.primaryPink,
        ),
      ),
    );
  }
}
