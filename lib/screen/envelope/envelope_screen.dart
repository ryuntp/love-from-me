import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:animated_text_kit/animated_text_kit.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_colors.dart';
import '../../common/components/raining_hearts_background.dart';
import '../../common/components/animated_envelope.dart';
import '../date_count/date_count_screen.dart';
import 'package:provider/provider.dart';
import '../../common/services/audio_service.dart';

class EnvelopeScreen extends StatefulWidget {
  const EnvelopeScreen({super.key});

  @override
  State<EnvelopeScreen> createState() => _EnvelopeScreenState();
}

class _EnvelopeScreenState extends State<EnvelopeScreen> {
  bool _isInitialized = false;

  @override
  void initState() {
    super.initState();
    // Initialize state after frame is built
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        setState(() {
          _isInitialized = true;
        });
      }
    });
  }

  void _handleSwipeUp(BuildContext context) {
    // Add haptic feedback
    HapticFeedback.mediumImpact();
    
    // Start background music when transitioning to next screen
    context.read<AudioService>().startBackgroundMusic();
    
    Navigator.of(context).push(
      PageRouteBuilder(
        pageBuilder: (context, animation, secondaryAnimation) =>
            const DateCountScreen(),
        transitionsBuilder: (context, animation, secondaryAnimation, child) {
          const begin = Offset(0.0, 1.0);
          const end = Offset.zero;
          const curve = Curves.easeOutCubic;

          var tween =
              Tween(begin: begin, end: end).chain(CurveTween(curve: curve));
          var offsetAnimation = animation.drive(tween);

          return SlideTransition(
            position: offsetAnimation,
            child: child,
          );
        },
        transitionDuration: const Duration(milliseconds: 800),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      child: Scaffold(
        body: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: AppColors.backgroundGradient,
            ),
          ),
          child: Stack(
            children: [
              // Raining hearts background
              const RainingHeartsBackground(),

              // Content
              Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // Animated envelope
                    AnimatedEnvelope(
                      onSwipeUp: () => _handleSwipeUp(context),
                    ),

                    const SizedBox(height: 40),

                    // Animated welcome text
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Column(
                        children: [
                          DefaultTextStyle(
                            style: GoogleFonts.dancingScript(
                              fontSize: 32,
                              color: AppColors.primaryPink,
                              fontWeight: FontWeight.bold,
                              shadows: [
                                Shadow(
                                  color: AppColors.primaryPink
                                      .withOpacity(0.3),
                                  offset: const Offset(2, 2),
                                  blurRadius: 4,
                                ),
                              ],
                            ),
                            child: AnimatedTextKit(
                              animatedTexts: [
                                TypewriterAnimatedText(
                                  'knock knock.. Maprang!',
                                  speed: const Duration(milliseconds: 100),
                                ),
                              ],
                              repeatForever: false,
                              totalRepeatCount: 1,
                              displayFullTextOnTap: true,
                            ),
                          ),
                          const SizedBox(height: 16),
                          DefaultTextStyle(
                            style: GoogleFonts.mali(
                              fontSize: 26,
                              color: AppColors.primaryRed,
                              fontWeight: FontWeight.w600,
                              height: 1.3,
                            ),
                            child: AnimatedTextKit(
                              animatedTexts: [
                                FadeAnimatedText(
                                  'You\'ve received message\nfrom your Babeby',
                                  duration: const Duration(seconds: 3),
                                  fadeOutBegin: 0.8,
                                  fadeInEnd: 0.2,
                                  textAlign: TextAlign.center,
                                ),
                              ],
                              repeatForever: false,
                              totalRepeatCount: 1,
                            ),
                          ),
                        ],
                      ),
                    ),

                    // Swipe up indicator
                    const SizedBox(height: 40),
                    Icon(
                      Icons.keyboard_arrow_up,
                      color: AppColors.primaryPink.withOpacity(0.6),
                      size: 40,
                    )
                        .animate(
                          onComplete: (controller) => controller.repeat(),
                        )
                        .moveY(
                          duration: const Duration(seconds: 1),
                          begin: 0,
                          end: -20,
                          curve: Curves.easeInOut,
                        )
                        .fadeOut(
                          duration: const Duration(milliseconds: 500),
                          delay: const Duration(milliseconds: 500),
                        ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
