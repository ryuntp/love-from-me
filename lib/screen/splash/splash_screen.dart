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
  String _enteredPin = '';
  int _wrongAttempts = 0;
  String _errorMessage = '';
  bool _showError = false;

  final String _correctPin = '1803';

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
  }

  void _handlePinEntry(String digit) {
    if (_enteredPin.length < 4) {
      setState(() {
        _enteredPin += digit;
        if (_enteredPin.length == 4) {
          _checkPin();
        }
      });
    }
  }

  void _handleBackspace() {
    if (_enteredPin.isNotEmpty) {
      setState(() {
        _enteredPin = _enteredPin.substring(0, _enteredPin.length - 1);
        _showError = false;
      });
    }
  }

  void _checkPin() {
    if (_enteredPin == _correctPin) {
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
    } else {
      _wrongAttempts++;
      setState(() {
        switch (_wrongAttempts) {
          case 1:
            _errorMessage = 'ผิดได้ไง อย่าให้มีครั้งที่2';
            break;
          case 2:
            _errorMessage = 'บอกแล้วไง.. อย่าให้มีครั้งที่3';
            break;
          case 3:
            _errorMessage = '...กวนตีนละ อย่าให้มีครั้งที่4';
            break;
          case 4:
            _errorMessage = 'เดี๋ยวโดนตีบ้างละนะ';
            break;
          case 5:
            _errorMessage = 'ไม่น่ารักเลย 😤';
            break;
          default:
            _errorMessage = 'ไปนั่งคิดแล้วค่อยกลับมาใหม่นะ 🥹';
        }
        _showError = true;
        _enteredPin = '';
      });
    }
  }

  Widget _buildPinDots() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(4, (index) {
        bool isFilled = index < _enteredPin.length;
        return Container(
          margin: const EdgeInsets.symmetric(horizontal: 8),
          width: 20,
          height: 20,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: isFilled ? Colors.white : Colors.white.withOpacity(0.3),
            border: Border.all(color: Colors.white, width: 2),
            boxShadow: isFilled
                ? [
                    BoxShadow(
                      color: AppColors.primaryPink.withOpacity(0.5),
                      blurRadius: 8,
                      spreadRadius: 2,
                    )
                  ]
                : null,
          ),
        ).animate(
          target: isFilled ? 1 : 0,
          effects: [
            ScaleEffect(
              duration: 200.ms,
              begin: const Offset(0.8, 0.8),
              end: const Offset(1, 1),
            ),
          ],
        );
      }),
    );
  }

  Widget _buildNumberButton(String number) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => _handlePinEntry(number),
        customBorder: const CircleBorder(),
        child: Container(
          width: 65,
          height: 65,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Colors.white.withOpacity(0.15),
            border: Border.all(color: Colors.white.withOpacity(0.3)),
          ),
          child: Center(
            child: Text(
              number,
              style: GoogleFonts.mali(
                fontSize: 24,
                color: Colors.white,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      ),
    ).animate(
      effects: [
        ScaleEffect(
          duration: 200.ms,
          begin: const Offset(1, 1),
          end: const Offset(0.95, 0.95),
          curve: Curves.easeInOut,
        ),
      ],
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
            SafeArea(
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
                  const SizedBox(height: 24),
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
                      ),
                  const SizedBox(height: 40),
                  _buildPinDots(),
                  if (_showError)
                    Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: Text(
                        _errorMessage,
                        style: GoogleFonts.mali(
                          fontSize: 16,
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                        ),
                      )
                          .animate()
                          .fadeIn(duration: 300.ms)
                          .shake(duration: 500.ms),
                    ),
                  const SizedBox(height: 40),
                  Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          _buildNumberButton('1'),
                          const SizedBox(width: 24),
                          _buildNumberButton('2'),
                          const SizedBox(width: 24),
                          _buildNumberButton('3'),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          _buildNumberButton('4'),
                          const SizedBox(width: 24),
                          _buildNumberButton('5'),
                          const SizedBox(width: 24),
                          _buildNumberButton('6'),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          _buildNumberButton('7'),
                          const SizedBox(width: 24),
                          _buildNumberButton('8'),
                          const SizedBox(width: 24),
                          _buildNumberButton('9'),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Container(
                            width: 65,
                            height: 65,
                          ),
                          const SizedBox(width: 24),
                          _buildNumberButton('0'),
                          const SizedBox(width: 24),
                          Material(
                            color: Colors.transparent,
                            child: InkWell(
                              onTap: _handleBackspace,
                              customBorder: const CircleBorder(),
                              child: Container(
                                width: 65,
                                height: 65,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: Colors.white.withOpacity(0.15),
                                  border: Border.all(
                                      color: Colors.white.withOpacity(0.3)),
                                ),
                                child: const Center(
                                  child: Icon(
                                    Icons.backspace_outlined,
                                    color: Colors.white,
                                    size: 24,
                                  ),
                                ),
                              ),
                            ),
                          ).animate(
                            effects: [
                              ScaleEffect(
                                duration: 200.ms,
                                begin: const Offset(1, 1),
                                end: const Offset(0.95, 0.95),
                                curve: Curves.easeInOut,
                              ),
                            ],
                          ),
                        ],
                      ),
                    ],
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