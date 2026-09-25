# ProGuard configuration for BaitBuddy (Capacitor WebView app)

# Preserve line numbers for debugging
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Keep Capacitor classes
-keep class com.getcapacitor.** { *; }
-keep class com.getcapacitor.plugin.** { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
  public <init>(com.getcapacitor.CapacitorPlugin);
}

# Keep JavaScript bridge interface
-keepclassmembers class * {
  *** on*(android.webkit.WebView, ...);
}

# Keep annotation classes
-keepattributes *Annotation*
-keep interface * { *; }

# Keep enum classes
-keepclassmembers enum * {
  public static **[] values();
  public static ** valueOf(java.lang.String);
}

# Preserve native method names (needed by WebView)
-keepclasseswithmembernames class * {
  native <methods>;
}

# Keep inner classes (required for callbacks and listeners)
-keepclassmembers class * {
  void *(android.view.View);
}

# Preserve classes that might be instantiated via reflection
-keep public class * extends android.app.Activity
-keep public class * extends android.app.Service
-keep public class * extends android.content.BroadcastReceiver
-keep public class * extends android.content.ContentProvider

# Optimization settings
-optimizationpasses 5
-allowaccessmodification

# Lokaler KI-Buddy: JNI ruft LlamaNative.TokenCallback.onToken([B)Z per Namen auf.
-keep class app.baitbuddy.mobile.llm.LlamaNative { *; }
-keep interface app.baitbuddy.mobile.llm.LlamaNative$TokenCallback { *; }
-keepclassmembers class * implements app.baitbuddy.mobile.llm.LlamaNative$TokenCallback {
  public boolean onToken(byte[]);
}
