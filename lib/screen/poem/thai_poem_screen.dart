import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animated_text_kit/animated_text_kit.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../theme/app_colors.dart';
import '../../common/components/raining_hearts_background.dart';
import '../../screen/envelope/envelope_screen.dart';

class ThaiPoemScreen extends StatefulWidget {
  const ThaiPoemScreen({super.key});

  @override
  State<ThaiPoemScreen> createState() => _ThaiPoemScreenState();
}

class _ThaiPoemScreenState extends State<ThaiPoemScreen> {
  final PageController _pageController = PageController();
  int _currentPage = 0;
  bool _showValentineMessage = false;
  bool _poemCompleted = false;

  // Placeholder poems (will be replaced with actual content)
  final List<String> _poems = [
    'ขอบคุณที่เข้ามาในชีวิต\nให้ได้คิดได้รู้ถึงความหมาย\nขอบคุณที่คอยดูแลแนบเคียงกาย\nรักมากมายนะมะปรางของฬิวเอง',
  ];

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _onPoemComplete() {
    if (!_poemCompleted) {
      setState(() {
        _poemCompleted = true;
      });
      Future.delayed(const Duration(milliseconds: 500), () {
        setState(() {
          _showValentineMessage = true;
        });
      });
    }
  }

  void _showValentineDialog() {
    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (BuildContext context) {
        return Dialog(
          backgroundColor: Colors.transparent,
          child: Container(
            width: MediaQuery.of(context).size.width * 0.85,
            constraints: BoxConstraints(
              maxWidth: 350,
              maxHeight: MediaQuery.of(context).size.height * 0.8,
            ),
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: AppColors.white.withOpacity(0.95),
              borderRadius: BorderRadius.circular(20),
              boxShadow: [
                BoxShadow(
                  color: AppColors.primaryPink.withOpacity(0.3),
                  blurRadius: 15,
                  spreadRadius: 5,
                ),
              ],
              border: Border.all(
                color: AppColors.primaryPink.withOpacity(0.5),
                width: 2,
              ),
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Red Panda GIF
                  ClipRRect(
                    borderRadius: BorderRadius.circular(15),
                    child: Image.asset(
                      'assets/images/giphy.gif',
                      width: 180,
                      height: 180,
                      fit: BoxFit.cover,
                    ),
                  ),
                  const SizedBox(height: 16),
                  // Valentine's Message
                  Text(
                    'Happy our first Valentine kub babeby.',
                    style: GoogleFonts.mali(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: AppColors.primaryPink,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Thank you for the best support\nI\'ve ever received.',
                    style: GoogleFonts.mali(
                      fontSize: 16,
                      color: AppColors.primaryPink,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Let\'s be together for\na hundred years more.',
                    style: GoogleFonts.mali(
                      fontSize: 16,
                      color: AppColors.primaryPink,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Flexible(
                        child: Text(
                          'I love you na Maprang',
                          style: GoogleFonts.mali(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: AppColors.primaryPink,
                          ),
                          textAlign: TextAlign.center,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Text(
                        '💙',
                        style: TextStyle(fontSize: 24),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  ElevatedButton(
                    onPressed: () {
                      // Close the dialog first
                      Navigator.of(context).pop();
                      // Replace the entire navigation stack with a fresh instance of the first screen
                      Navigator.of(context).pushAndRemoveUntil(
                        MaterialPageRoute(
                          builder: (context) => const EnvelopeScreen(),
                        ),
                        (route) => false, // Remove all existing routes
                      );
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primaryPink.withOpacity(0.8),
                      foregroundColor: AppColors.white,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 24, vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(20),
                      ),
                      elevation: 4,
                    ),
                    child: Text(
                      'กลับไปเขินอีกรอบ',
                      style: GoogleFonts.mali(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          )
              .animate()
              .scale(
                duration: const Duration(milliseconds: 500),
                curve: Curves.easeOutBack,
              )
              .fadeIn(duration: const Duration(milliseconds: 500)),
        );
      },
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
              AppColors.backgroundLight,
              AppColors.secondaryPink.withOpacity(0.3),
            ],
          ),
        ),
        child: Stack(
          children: [
            // Background effects
            const RainingHeartsBackground(numberOfHearts: 15),

            // Main content
            SafeArea(
              child: Column(
                children: [
                  // Header
                  Padding(
                    padding: const EdgeInsets.all(24.0),
                    child: Text(
                      'กลอนแปรดที่เทอว์ข๋อ',
                      style: GoogleFonts.mali(
                        fontSize: 36,
                        fontWeight: FontWeight.bold,
                        color: AppColors.primaryPink,
                        shadows: [
                          Shadow(
                            color: AppColors.primaryPink.withOpacity(0.3),
                            offset: const Offset(2, 2),
                            blurRadius: 4,
                          ),
                        ],
                      ),
                    ),
                  ),

                  // Poem pages
                  Expanded(
                    child: PageView.builder(
                      controller: _pageController,
                      onPageChanged: (index) {
                        setState(() => _currentPage = index);
                      },
                      itemCount: _poems.length,
                      itemBuilder: (context, index) {
                        return _buildPoemCard(_poems[index], index);
                      },
                    ),
                  ),

                  // Navigation dots
                  Padding(
                    padding: const EdgeInsets.all(24.0),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: List.generate(
                        _poems.length,
                        (index) => _buildDot(index),
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Valentine's Message Trigger
            if (_showValentineMessage)
              Positioned.fill(
                child: GestureDetector(
                  onTap: _showValentineDialog,
                  child: Container(
                    color: Colors.transparent,
                    child: Center(
                      child: Container(
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: AppColors.white.withOpacity(0.9),
                          borderRadius: BorderRadius.circular(15),
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.primaryPink.withOpacity(0.3),
                              blurRadius: 10,
                              spreadRadius: 2,
                            ),
                          ],
                        ),
                        child: Text(
                          'กดดิ แล้วจะยิ้มกว้างกว่าเดิม 💝',
                          style: GoogleFonts.mali(
                            fontSize: 24,
                            fontWeight: FontWeight.bold,
                            color: AppColors.primaryPink,
                          ),
                        ),
                      )
                          .animate(
                            onPlay: (controller) =>
                                controller.repeat(reverse: true),
                          )
                          .scale(
                            duration: const Duration(seconds: 1),
                            begin: const Offset(1, 1),
                            end: const Offset(1.1, 1.1),
                          ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildPoemCard(String poem, int index) {
    return Padding(
      padding: const EdgeInsets.all(24.0),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.white.withOpacity(0.9),
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color: AppColors.primaryPink.withOpacity(0.2),
              blurRadius: 15,
              spreadRadius: 5,
            ),
          ],
          border: Border.all(
            color: AppColors.primaryPink.withOpacity(0.3),
            width: 2,
          ),
        ),
        child: Stack(
          children: [
            // Decorative corners
            ..._buildCornerDecorations(),

            // Poem content
            Center(
              child: Padding(
                padding: const EdgeInsets.all(40.0),
                child: DefaultTextStyle(
                  style: GoogleFonts.mali(
                    fontSize: 24,
                    height: 1.8,
                    color: AppColors.textPrimary,
                  ),
                  child: AnimatedTextKit(
                    animatedTexts: [
                      TypewriterAnimatedText(
                        poem,
                        speed: const Duration(milliseconds: 100),
                        textAlign: TextAlign.center,
                      ),
                    ],
                    totalRepeatCount: 1,
                    displayFullTextOnTap: true,
                    onFinished: _onPoemComplete,
                  ),
                ),
              ),
            ),
          ],
        ),
      )
          .animate(
            onPlay: (controller) => controller.repeat(reverse: true),
          )
          .scale(
            duration: const Duration(seconds: 3),
            begin: const Offset(1, 1),
            end: const Offset(1.02, 1.02),
            curve: Curves.easeInOut,
          ),
    );
  }

  List<Widget> _buildCornerDecorations() {
    return [
      Positioned(
        top: 20,
        left: 20,
        child: _buildCornerHeart(),
      ),
      Positioned(
        top: 20,
        right: 20,
        child: _buildCornerHeart(),
      ),
      Positioned(
        bottom: 20,
        left: 20,
        child: _buildCornerHeart(),
      ),
      Positioned(
        bottom: 20,
        right: 20,
        child: _buildCornerHeart(),
      ),
    ];
  }

  Widget _buildCornerHeart() {
    return Icon(
      Icons.favorite,
      color: AppColors.primaryPink.withOpacity(0.3),
      size: 30,
    )
        .animate(
          onPlay: (controller) => controller.repeat(reverse: true),
        )
        .scale(
          duration: const Duration(seconds: 2),
          begin: const Offset(1, 1),
          end: const Offset(1.3, 1.3),
          curve: Curves.easeInOut,
        );
  }

  Widget _buildDot(int index) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 4),
      width: 12,
      height: 12,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: _currentPage == index
            ? AppColors.primaryPink
            : AppColors.primaryPink.withOpacity(0.3),
      ),
    )
        .animate(
          target: _currentPage == index ? 1 : 0,
        )
        .scale(
          duration: const Duration(milliseconds: 300),
          begin: const Offset(1, 1),
          end: const Offset(1.3, 1.3),
        );
  }
}
