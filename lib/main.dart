import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'common/services/audio_service.dart';
import 'screen/envelope/envelope_screen.dart';
import 'theme/app_theme.dart';
import 'screen/splash/splash_screen.dart';
import 'theme/app_colors.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AudioService(),
      child: MaterialApp(
        title: 'Love From Me',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: AppColors.primaryPink),
          useMaterial3: true,
        ),
        home: const SplashScreen(),
      ),
    );
  }
}
