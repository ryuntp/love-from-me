import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_colors.dart';
import '../envelope/envelope_screen.dart';
import '../../common/components/particle_effect.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  bool _showParticles = false;
  final GlobalKey _heartKey = GlobalKey();

  @override
  void initState() {
    super.initState();
    _setupAnimations();
  }

  void _setupAnimations() {
    Future.delayed(const Duration(milliseconds: 1500), () {
      if (mounted) {
        setState(() => _showParticles = true);
      }
    });
    _navigateToMain();
  }

  Future<void> _navigateToMain() async {
    await Future.delayed(const Duration(seconds: 4));
    if (!mounted) return;
    
    Navigator.of(context).pushReplacement(
      PageRouteBuilder(
        pageBuilder: (context, animation, secondaryAnimation) =>
            const EnvelopeScreen(),
        transitionsBuilder: (context, animation, secondaryAnimation, child) {
          return FadeTransition(
            opacity: animation,
            child: child,
          );
        },
        transitionDuration: const Duration(milliseconds: 1200),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              AppColors.primaryPink.withOpacity(0.8),
              AppColors.primaryRed.withOpacity(0.6),
            ],
          ),
        ),
        child: Stack(
          children: [
            if (_showParticles)
              Positioned.fill(
                child: ParticleEffect(
                  position: _getHeartPosition(),
                  color: Colors.white,
                  numberOfParticles: 30,
                  duration: const Duration(milliseconds: 2000),
                ),
              ),
            Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.favorite,
                    key: _heartKey,
                    color: Colors.white,
                    size: 100,
                  )
                      .animate(
                        onPlay: (controller) => controller.repeat(),
                      )
                      .scale(
                        duration: 1200.ms,
                        curve: Curves.easeInOut,
                        begin: const Offset(1, 1),
                        end: const Offset(1.3, 1.3),
                      )
                      .then()
                      .scale(
                        duration: 1200.ms,
                        curve: Curves.easeInOut,
                        begin: const Offset(1.3, 1.3),
                        end: const Offset(1, 1),
                      )
                      .shimmer(
                        duration: 2400.ms,
                        color: AppColors.primaryPink.withOpacity(0.3),
                      ),
                  const SizedBox(height: 40),
                  Text(
                    'Babebyyyy ~',
                    style: GoogleFonts.dancingScript(
                      fontSize: 48,
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      shadows: [
                        Shadow(
                          color: AppColors.primaryRed.withOpacity(0.5),
                          offset: const Offset(2, 2),
                          blurRadius: 4,
                        ),
                      ],
                    ),
                  )
                      .animate()
                      .fadeIn(
                        duration: 800.ms,
                        curve: Curves.easeOut,
                      )
                      .slideY(
                        begin: 0.3,
                        end: 0,
                        curve: Curves.easeOutCubic,
                      )
                      .then()
                      .shimmer(
                        duration: 2000.ms,
                        color: Colors.white.withOpacity(0.3),
                      ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Offset _getHeartPosition() {
    if (!_heartKey.currentContext!.mounted) return const Offset(0, 0);
    
    final RenderBox box = _heartKey.currentContext!.findRenderObject() as RenderBox;
    final position = box.localToGlobal(Offset.zero);
    return Offset(
      position.dx + box.size.width / 2,
      position.dy + box.size.height / 2,
    );
  }
} 