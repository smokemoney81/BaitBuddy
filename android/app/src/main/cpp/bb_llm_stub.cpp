// Minimal-Bibliothek fuer 32-Bit-ABIs (armeabi-v7a, x86).
//
// llama.cpp wird nur fuer arm64-v8a und x86_64 gebaut: Ein 32-Bit-Prozess kann
// ein Modell mit mehreren GB ohnehin nicht einblenden. Ohne jede Bibliothek fuer
// diese ABIs wuerde das APK aber nur noch 64-Bit-Native-Code enthalten und
// Google Play/der Installer die App auf 32-Bit-Geraeten komplett ablehnen.
// Diese Bibliothek haelt die App dort installierbar und meldet nur
// "nicht unterstuetzt" — der KI-Buddy laeuft auf solchen Geraeten ueber die Cloud.

#include <jni.h>

extern "C" JNIEXPORT jboolean JNICALL
Java_app_baitbuddy_mobile_llm_LlamaNative_nativeIsSupported(JNIEnv *, jclass) {
    return JNI_FALSE;
}
