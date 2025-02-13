import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'common/services/audio_service.dart';
import 'screen/envelope/envelope_screen.dart';
import 'theme/app_theme.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AudioService()),
      ],
      child: MaterialApp(
        title: "Babeby V's day",
        theme: AppTheme.lightTheme,
        debugShowCheckedModeBanner: false,
        home: const EnvelopeScreen(),
      ),
    );
  }
}
